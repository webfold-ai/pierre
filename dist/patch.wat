(module
  (;;
    memory
    [] page 1         (control + static data)
      [0]             op (u8): 1 = diffChars, 2 = diffWordsWithSpace,
                      3 = unified-patch hunks (line tokens), 4 = diffLines
      [1]             output flag (u8): 0 = error, 1 = success
      [2]             patch header flags (op 3 input): includeIndex, includeUnderline,
                      includeFileHeaders, oldFileName/newFileName defined
      [3]             input flags: bit 0/1 old/new text is pure ASCII (op 1/2/4),
                      bit 2 ignoreWhitespace (op 3/4)
      [4:8)           old text length (u32 LE)
      [8:12)          new text length (u32 LE)
      [12:16)         change-record count (op 1/2/4) / error message length
      [16:20)         result pointer: change records, patch text, or error message
      [20:24)         patch text length (op 3)
      [24:28)         context line count (op 3 input)
      [28:44)         filename/header byte lengths (4 × u32, op 3 input)
      [64:192)        ASCII word/space class table for the word tokenizer
      [1016:1024)     $hashToken multiplier (u64 LE, odd); the host sets a random
                      one per instance so crafted tokens cannot force collisions
      [1024:1073)     static strings, packed gap-free (error message, the
                      no-newline marker, C escape letters)
      [1073:1083)     $itoa digit scratch
    [] page 2..N      (text buffer)
      [65536:oldEnd)  old text (WTF-8)
      [oldEnd:newEnd) new text
      [newEnd:EOF)    op 3: oldFileName, newFileName, oldHeader, newHeader
      [EOF:EOF+32)    pad so SIMD scans (<= 32 bytes) may overread safely
      [EOF+32:...)    bump-allocated workspace
  ;;)
  (memory (export "memory") 2)

  (global $err    (mut i32) (i32.const 0))
  (global $heap   (mut i32) (i32.const 0))
  ;; addressable bytes as of the last $ensure; may lag a host grow (only costs a slow path).
  ;; Warning: 4 GiB wraps to 0, so every $alloc then takes the (still correct) slow path.
  (global $memEnd (mut i32) (i32.const 0))

  ;; page-1 statics, one gap-free segment so one copy of the framing ships (layout above)
  (data (i32.const 1016)
    "\15\7c\4a\7f\b9\79\37\9e"         ;; 1016: 0x9E3779B97F4A7C15
    "out of memory"                    ;; 1024, len 13
    "\n\\ No newline at end of file\n" ;; 1037, len 29
    "abtnvfr")                         ;; 1066: C escape letters for bytes 07..0D

  ;; the only error: [12:16)=message length, [16:20)=message pointer; the driver
  ;; writes ok=0 at exit
  (func $oom
    (global.set $err (i32.const 1))
    (i32.store (i32.const 12) (i32.const 13))
    (i32.store (i32.const 16) (i32.const 1024))
  )

  ;; grow until [0, $end) is addressable; 1=ok, 0=cannot grow
  (func $ensure (param $end i32) (result i32)
    (local $delta i32)
    ;; missing pages; sizes stay << 2^31 so signed <= is safe
    (local.set $delta (i32.sub
      (i32.add (i32.shr_u (i32.sub (local.get $end) (i32.const 1)) (i32.const 16)) (i32.const 1))
      (memory.size)))
    (if (i32.gt_s (local.get $delta) (i32.const 0))
      (then
        ;; +25% slack so small allocs don't grow a page at a time
        (if (i32.eq
              (memory.grow (i32.add (local.get $delta) (i32.shr_u (memory.size) (i32.const 2))))
              (i32.const -1))
          (then
            (if (i32.eq (memory.grow (local.get $delta)) (i32.const -1))
              (then (return (i32.const 0))))))))
    (global.set $memEnd (i32.shl (memory.size) (i32.const 16)))
    (i32.const 1)
  )

  ;; bump $size bytes, 8-aligned; 0 = OOM ($err set)
  (func $alloc (param $size i32) (result i32)
    (local $base i32) (local $end i32)
    (local.set $base (i32.and (i32.add (global.get $heap) (i32.const 7)) (i32.const -8)))
    (local.set $end (i32.add (local.get $base) (local.get $size)))
    ;; two separate ifs: merging (i32.or / shared-oom) costs ~7-10% on every bench
    ;; via binaryen inlining this into the Myers component allocator
    ;; Warning: compare with $heap, not $base: rounding up can wrap $base to 0 at 4 GiB
    (if (i32.lt_u (local.get $end) (global.get $heap))
      (then
        (call $oom)
        (return (i32.const 0))))
    ;; fast path: one compare against the cached size instead of $ensure's memory.size math
    (if (i32.gt_u (local.get $end) (global.get $memEnd))
      (then
        (if (i32.eqz (call $ensure (local.get $end)))
          (then
            (call $oom)
            (return (i32.const 0))))))
    (global.set $heap (local.get $end))
    (local.get $base)
  )

  ;; write unsigned $n as decimal at $ptr; returns end. Digits build backwards in
  ;; [1073:1083) (10 bytes fit any u32) then one memory.copy — smaller than a count loop.
  (func $itoa (param $ptr i32) (param $n i32) (result i32)
    (local $p i32)
    (local.set $p (i32.const 1083))
    (loop $write
      (local.set $p (i32.sub (local.get $p) (i32.const 1)))
      (i32.store8 (local.get $p) (i32.add (i32.const 48) (i32.rem_u (local.get $n) (i32.const 10))))
      (local.set $n (i32.div_u (local.get $n) (i32.const 10)))
      (br_if $write (local.get $n)))
    (memory.copy (local.get $ptr) (local.get $p) (i32.sub (i32.const 1083) (local.get $p)))
    (i32.add (local.get $ptr) (i32.sub (i32.const 1083) (local.get $p)))
  )

  ;; 1 if [$a,$a+$len)==[$b,$b+$len). 8 bytes/step; last chunk re-reads the last 8 so
  ;; nothing past either range is read. Sub-8: masked i64 load per side; <=7-byte
  ;; overread stays in the string-area pad (token/filename callers). $len=0 only when
  ;; $a==$b (equal-length filenames, adjacent), so any mask still answers 1.
  (func $memcmp (param $a i32) (param $b i32) (param $len i32) (result i32)
    (local $end i32)
    (if (i32.lt_u (local.get $len) (i32.const 8))
      (then
        (return (i64.eqz (i64.and
          (i64.xor (i64.load (local.get $a)) (i64.load (local.get $b)))
          (i64.shr_u
            (i64.const -1)
            (i64.extend_i32_u
              (i32.shl (i32.sub (i32.const 8) (local.get $len)) (i32.const 3)))))))))
    (local.set $end (i32.sub (i32.add (local.get $a) (local.get $len)) (i32.const 8)))
    (block $ne (loop $words
      (br_if $ne (i64.ne (i64.load (local.get $a)) (i64.load (local.get $b))))
      (local.set $a (i32.add (local.get $a) (i32.const 8)))
      (local.set $b (i32.add (local.get $b) (i32.const 8)))
      (if (i32.ge_u (local.get $a) (local.get $end))
        (then
          (return (i64.eq
            (i64.load (local.get $end))
            (i64.load (i32.add (local.get $b) (i32.sub (local.get $end) (local.get $a))))))))
      (br $words)))
    (i32.const 0)
  )

  ;; multiply-mix hash of $len bytes at $ptr, 8 bytes/step + one masked i64 tail.
  ;; Tail may overread <=7 bytes (string-area pad); the mask drops them. Equal bytes
  ;; hash equal; the value never affects output (intern confirms with len+$memcmp).
  (func $hashToken (param $ptr i32) (param $len i32) (result i32)
    (local $h i64) (local $g i64) (local $t i64) (local $k i64) (local $tail i32) (local $x i32)
    (local.set $h (i64.extend_i32_u (local.get $len)))
    ;; a load, not a const: JITs then keep it in a register across the loop
    ;; instead of rebuilding it per chunk
    (local.set $k (i64.load (i32.const 1016)))
    ;; $tail = start of the final 1..8-byte piece ($len is never 0 here)
    (local.set $tail (i32.add
      (local.get $ptr)
      (i32.and (i32.sub (local.get $len) (i32.const 1)) (i32.const -8))))
    (block $chunked (loop $chunks
      (br_if $chunked (i32.ge_u (local.get $ptr) (local.get $tail)))
      ;; rotate so the multiply's high (well-mixed) bits feed the next chunk. Two
      ;; accumulators take turns, so consecutive multiplies overlap.
      (local.set $t (i64.rotr
        (i64.mul (i64.xor (local.get $h) (i64.load (local.get $ptr))) (local.get $k))
        (i64.const 32)))
      (local.set $h (local.get $g))
      (local.set $g (local.get $t))
      (local.set $ptr (i32.add (local.get $ptr) (i32.const 8)))
      (br $chunks)))
    ;; final piece: (-1 >> 8*(-len & 7)) keeps exactly the remaining bytes
    (local.set $h (i64.xor
      (i64.mul
        (i64.xor
          (local.get $h)
          (i64.and
            (i64.load (local.get $tail))
            (i64.shr_u
              (i64.const -1)
              (i64.extend_i32_u (i32.shl
                (i32.and (i32.sub (i32.const 0) (local.get $len)) (i32.const 7))
                (i32.const 3))))))
        (local.get $k))
      (local.get $g)))
    ;; fold high half, then once more in 32 bits so any difference reaches hash&mask bits
    (local.set $x (i32.wrap_i64 (i64.xor (local.get $h) (i64.shr_u (local.get $h) (i64.const 32)))))
    (i32.xor (local.get $x) (i32.shr_u (local.get $x) (i32.const 16)))
  )

  ;; last decoded code point + its byte length (set by $decodeCp)
  (global $cp      (mut i32) (i32.const 0))
  (global $cpLen   (mut i32) (i32.const 0))

  ;; intern table: 8-byte slots (ptr, len), open addressing; a token's id is its
  ;; slot index. Hash is a bucket index; matches compare len+bytes
  (global $tabBase (mut i32) (i32.const 0))
  (global $tabMask (mut i32) (i32.const 0))

  ;; UTF-8 at $p (< $end) -> $cp/$cpLen. Callers pass leads >= 0x80 only (ASCII is
  ;; inline at every site). Malformed/truncated: 1-byte token, id = 0x110000+byte
  ;; so it never collides with a real char.
  (func $decodeCp (param $p i32) (param $end i32)
    (local $b0 i32) (local $n i32) (local $w i32)
    (local.set $b0 (i32.load8_u (local.get $p)))
    (block $invalid
      ;; valid leads are exactly C2..F4 (C0/C1 are overlong, F5.. > U+10FFFF)
      (br_if $invalid (i32.gt_u (i32.sub (local.get $b0) (i32.const 0xC2)) (i32.const 0x32)))
      ;; length = count of leading 1-bits: C2..DF 2, E0..EF 3, F0..F4 4
      (local.set $n (i32.clz (i32.xor (i32.shl (local.get $b0) (i32.const 24)) (i32.const -1))))
      (br_if $invalid (i32.gt_u (i32.add (local.get $p) (local.get $n)) (local.get $end)))
      ;; i32 load may overread $end into the pad
      (local.set $w (i32.load (local.get $p)))
      (global.set $cpLen (local.get $n))
      (local.set $b0 (i32.and (local.get $b0) (i32.shr_u (i32.const 0x7F) (local.get $n))))
      (loop $acc ;; validate + accumulate the n-1 continuation bytes
        (local.set $w (i32.shr_u (local.get $w) (i32.const 8)))
        (br_if $invalid (i32.ne (i32.and (local.get $w) (i32.const 0xC0)) (i32.const 0x80)))
        (local.set $b0 (i32.or
          (i32.shl (local.get $b0) (i32.const 6))
          (i32.and (local.get $w) (i32.const 0x3F))))
        (br_if $acc (i32.gt_u
          (local.tee $n (i32.sub (local.get $n) (i32.const 1)))
          (i32.const 1))))
      (global.set $cp (local.get $b0))
      (return))
    ;; $b0 may hold partial accumulator bits here; reload the lead byte
    (global.set $cp (i32.add (i32.const 0x110000) (i32.load8_u (local.get $p))))
    (global.set $cpLen (i32.const 1))
  )

  ;; UTF-16 units of tokens [$tok, $tok+$cnt) of the text at $src with byte
  ;; offsets $offs: the byte count when $ascii, else +1 per non-continuation byte,
  ;; +1 more per 4-byte lead (>=0xF0, astral -> surrogate pair). SIMD 16 bytes/step;
  ;; load may overread the range (old text runs into new, new into the pad); tail
  ;; mask drops overread bytes from both bitmask counts.
  (func $utf16Units
    (param $src i32) (param $offs i32) (param $tok i32) (param $cnt i32) (param $ascii i32)
    (result i32)
    (local $p i32) (local $end i32) (local $n i32) (local $mask i32) (local $v v128)
    (local.set $p (i32.add
      (local.get $src)
      (i32.load (i32.add (local.get $offs) (i32.shl (local.get $tok) (i32.const 2))))))
    (local.set $end (i32.add
      (local.get $src)
      (i32.load (i32.add
        (local.get $offs)
        (i32.shl (i32.add (local.get $tok) (local.get $cnt)) (i32.const 2))))))
    (if (local.get $ascii) (then (return (i32.sub (local.get $end) (local.get $p)))))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $p) (local.get $end)))
      ;; ((1 << rem) - 1) keeps the low rem bits; a full chunk keeps all 16
      (local.set $mask (i32.const 0xFFFF))
      (if (i32.lt_u (i32.sub (local.get $end) (local.get $p)) (i32.const 16))
        (then
          (local.set $mask (i32.sub
            (i32.shl (i32.const 1) (i32.sub (local.get $end) (local.get $p)))
            (i32.const 1)))))
      (local.set $v (v128.load (local.get $p)))
      (local.set $n (i32.add (local.get $n) (i32.add
        ;; non-continuation: (b & 0xC0) != 0x80
        (i32.popcnt (i32.and
          (i32.xor
            (i8x16.bitmask (i8x16.eq
              (v128.and (local.get $v) (i8x16.splat (i32.const 0xC0)))
              (i8x16.splat (i32.const 0x80))))
            (i32.const 0xFFFF))
          (local.get $mask)))
        (i32.popcnt (i32.and
          (i8x16.bitmask (i8x16.ge_u (local.get $v) (i8x16.splat (i32.const 0xF0))))
          (local.get $mask))))))
      (local.set $p (i32.add (local.get $p) (i32.const 16)))
      (br $l)))
    (local.get $n)
  )

  ;; JS `\s` minus `\n` `\r` (`[^\S\n\r]`): TAB VT FF SP NBSP U+1680 U+2000-200A
  ;; U+2028 U+2029 U+202F U+205F U+3000 U+FEFF. ASCII (TAB VT FF SP) is inline in
  ;; $tokenizeWords; here $c >= 0x80.
  (func $isSpaceNotNl (param $c i32) (result i32)
    (local $d i32)
    ;; U+20xx via (c-0x2000) so constants stay small; wrap of c<0x2000 is far above every test
    (local.set $d (i32.sub (local.get $c) (i32.const 0x2000)))
    (i32.or
      (i32.or
        (i32.or
          (i32.eq (local.get $c) (i32.const 0xA0))
          (i32.eq (local.get $c) (i32.const 0x1680)))
        (i32.or
          (i32.le_u (local.get $d) (i32.const 0x0A))
          (i32.le_u (i32.sub (local.get $d) (i32.const 0x28)) (i32.const 1))))
      (i32.or
        (i32.or
          (i32.eq (local.get $d) (i32.const 0x2F))
          (i32.eq (local.get $d) (i32.const 0x5F)))
        (i32.or
          (i32.eq (local.get $c) (i32.const 0x3000))
          (i32.eq (local.get $c) (i32.const 0xFEFF)))))
  )

  ;; 1 if the code point at $p (< $end) is JS `trim()` whitespace: $isSpaceNotNl
  ;; plus \n \r. Sets $cpLen.
  (func $isTrimSpace (param $p i32) (param $end i32) (result i32)
    (local $c i32)
    (local.set $c (i32.load8_u (local.get $p)))
    (if (i32.lt_u (local.get $c) (i32.const 0x80))
      (then
        (global.set $cpLen (i32.const 1))
        ;; TAB LF VT FF CR, SP
        (return (i32.or
          (i32.le_u (i32.sub (local.get $c) (i32.const 9)) (i32.const 4))
          (i32.eq (local.get $c) (i32.const 0x20))))))
    (call $decodeCp (local.get $p) (local.get $end))
    (call $isSpaceNotNl (global.get $cp))
  )

  ;; one token per code point; ids are the code points themselves
  (func $tokenizeChars
    (param $src i32) (param $end i32) (param $offs i32) (param $ids i32) (result i32)
    (local $p i32) (local $n i32) (local $q i32) (local $e i32)
    (local $v v128) (local $w v128) (local $o v128)
    (local.set $p (local.get $src))
    (block $done (loop $l
      ;; ASCII SIMD: 16 cps/step (ids=bytes, consecutive offs) while a 16-byte load
      ;; stays in-range. Stores fit: offs/ids hold len+2/len+1 entries; $n <= 1 per byte.
      (block $scalar (loop $simd
        (br_if $scalar (i32.gt_u (i32.add (local.get $p) (i32.const 16)) (local.get $end)))
        (local.set $v (v128.load (local.get $p)))
        (br_if $scalar (i8x16.bitmask (local.get $v)))
        (local.set $q (i32.add (local.get $ids) (i32.shl (local.get $n) (i32.const 2))))
        (local.set $w (i16x8.extend_low_i8x16_u (local.get $v)))
        (v128.store (local.get $q) (i32x4.extend_low_i16x8_u (local.get $w)))
        (v128.store offset=16 (local.get $q) (i32x4.extend_high_i16x8_u (local.get $w)))
        (local.set $w (i16x8.extend_high_i8x16_u (local.get $v)))
        (v128.store offset=32 (local.get $q) (i32x4.extend_low_i16x8_u (local.get $w)))
        (v128.store offset=48 (local.get $q) (i32x4.extend_high_i16x8_u (local.get $w)))
        ;; loop, not unrolled stores: binaryen folds i32x4.splat(const) into an
        ;; 18-byte v128.const and rematerializes per use, so each vector const once
        (local.set $q (i32.add (local.get $offs) (i32.shl (local.get $n) (i32.const 2))))
        (local.set $e (i32.add (local.get $q) (i32.const 64)))
        (local.set $o (i32x4.add
          (i32x4.splat (i32.sub (local.get $p) (local.get $src)))
          (v128.const i32x4 0 1 2 3)))
        (loop $off
          (v128.store (local.get $q) (local.get $o))
          (local.set $o (i32x4.add (local.get $o) (i32x4.splat (i32.const 4))))
          (local.set $q (i32.add (local.get $q) (i32.const 16)))
          (br_if $off (i32.lt_u (local.get $q) (local.get $e))))
        (local.set $n (i32.add (local.get $n) (i32.const 16)))
        (local.set $p (i32.add (local.get $p) (i32.const 16)))
        (br $simd)))
      ;; also the end sentinel: $p==$end stores end-src and exits; else the same
      ;; slot is rewritten by the next SIMD round, or is this token's offset
      (i32.store
        (i32.add (local.get $offs) (i32.shl (local.get $n) (i32.const 2)))
        (i32.sub (local.get $p) (local.get $src)))
      (br_if $done (i32.ge_u (local.get $p) (local.get $end)))
      ;; one scalar cp (non-ASCII or tail), then retry SIMD; $decodeCp needs lead >= 0x80
      (local.set $q (i32.load8_u (local.get $p)))
      (if (i32.lt_u (local.get $q) (i32.const 0x80))
        (then
          (global.set $cp (local.get $q))
          (global.set $cpLen (i32.const 1)))
        (else (call $decodeCp (local.get $p) (local.get $end))))
      (i32.store (i32.add (local.get $ids) (i32.shl (local.get $n) (i32.const 2))) (global.get $cp))
      (local.set $n (i32.add (local.get $n) (i32.const 1)))
      (local.set $p (i32.add (local.get $p) (global.get $cpLen)))
      (br $l)))
    (local.get $n)
  )

  ;; ASCII class table [73:187) (layout in mem.wat): page-1 byte 64+$c is the
  ;; class of ASCII $c: 1 word, 2 space, 0 else. 0..8 and 123..127 stay zero-init.
  (data (i32.const 73)
    "\02\00\02\02\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00"           ;; TAB VT FF
    "\02\00\00\00\00\00\00\00\00\00\00\00\00\00\00\00"                                ;; SP
    "\01\01\01\01\01\01\01\01\01\01\00\00\00\00\00\00\00"                             ;; 0-9
    "\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01"  ;; A-Z
    "\00\00\00\00\01\00"                                                              ;; _
    "\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01\01") ;; a-z

  ;; jsdiff wordsWithSpaceDiff.tokenize: (\r?\n) | [word]+ | [^\S\n\r]+ | [^word].
  ;; A token starts where the cp class changes and at every class-0 cp, except
  ;; the \n of \r\n. ASCII class from table at 64; leads >= 0x80 pay
  ;; $decodeCp and the class tests. No branch on token ends: each cp stores its offset, and
  ;; only a token start keeps it.
  (func $tokenizeWords (param $src i32) (param $end i32) (param $offs i32) (result i32)
    (local $p i32) (local $c i32) (local $k i32) (local $prev i32) (local $cr i32) (local $o i32)
    (local $u i32)
    (local.set $p (local.get $src))
    (local.set $o (local.get $offs))
    ;; no class, so the first cp starts a token
    (local.set $prev (i32.const 3))
    (block $done (loop $l
      (br_if $done (i32.ge_u (local.get $p) (local.get $end)))
      (i32.store (local.get $o) (i32.sub (local.get $p) (local.get $src)))
      (local.set $c (i32.load8_u (local.get $p)))
      (if (i32.lt_u (local.get $c) (i32.const 0x80))
        (then
          (local.set $p (i32.add (local.get $p) (i32.const 1)))
          (local.set $k (i32.load8_u offset=64 (local.get $c))))
        (else ;; $c keeps the lead byte: >= 0x80, so it is never \n or \r below
          (call $decodeCp (local.get $p) (local.get $end))
          (local.set $p (i32.add (local.get $p) (global.get $cpLen)))
          (local.set $u (global.get $cp))
          ;; jsdiff extendedWordChars above ASCII: U+00AD U+00C0-D6 U+00D8-F6 U+00F8-2C6
          ;; U+02C8-2D7 U+02DE-2FF U+1E00-1EFF. Encoded as C0..2D7 minus {D7,F7,2C7};
          ;; D7 and F7 differ only in bit 5, so (c|0x20)==0xF7 tests both.
          (local.set $k (i32.or
            (i32.or
              (i32.or
                (i32.eq (local.get $u) (i32.const 0xAD))
                (i32.and
                  (i32.and
                    (i32.le_u (i32.sub (local.get $u) (i32.const 0xC0)) (i32.const 0x217))
                    (i32.ne (i32.or (local.get $u) (i32.const 0x20)) (i32.const 0xF7)))
                  (i32.ne (local.get $u) (i32.const 0x2C7))))
              (i32.or
                (i32.le_u (i32.sub (local.get $u) (i32.const 0x2DE)) (i32.const 0x21))
                (i32.le_u (i32.sub (local.get $u) (i32.const 0x1E00)) (i32.const 0xFF))))
            (i32.shl (call $isSpaceNotNl (local.get $u)) (i32.const 1))))))
      (local.set $o (i32.add (local.get $o) (i32.shl
        (i32.or
          (i32.ne (local.get $k) (local.get $prev))
          (i32.eqz (i32.or
            (local.get $k)
            (i32.and (local.get $cr) (i32.eq (local.get $c) (i32.const 0x0A))))))
        (i32.const 2))))
      (local.set $prev (local.get $k))
      (local.set $cr (i32.eq (local.get $c) (i32.const 0x0D)))
      (br $l)))
    (i32.store (local.get $o) (i32.sub (local.get $end) (local.get $src)))
    (i32.shr_u (i32.sub (local.get $o) (local.get $offs)) (i32.const 2))
  )

  ;; jsdiff lines: content + its \n/\r\n; split after every \n (a trailing piece
  ;; without \n is a token too). One SIMD pass: each \n of a 32-byte chunk ends a
  ;; token. The last loads may overread $end (pad or new text); a mask drops those bytes.
  (func $tokenizeLines (param $src i32) (param $end i32) (param $offs i32) (result i32)
    (local $p i32) (local $m i32) (local $o i32)
    (local.set $p (local.get $src))
    (local.set $o (local.get $offs))
    (i32.store (local.get $o) (i32.const 0))
    (block $done (loop $chunks
      (br_if $done (i32.ge_u (local.get $p) (local.get $end)))
      (local.set $m (i32.or
        (i8x16.bitmask (i8x16.eq (v128.load (local.get $p)) (i8x16.splat (i32.const 0x0A))))
        (i32.shl
          (i8x16.bitmask (i8x16.eq (v128.load offset=16 (local.get $p)) (i8x16.splat (i32.const 0x0A))))
          (i32.const 16))))
      (if (i32.lt_u (i32.sub (local.get $end) (local.get $p)) (i32.const 32))
        (then
          (local.set $m (i32.and
            (local.get $m)
            (i32.sub
              (i32.shl (i32.const 1) (i32.sub (local.get $end) (local.get $p)))
              (i32.const 1))))))
      (block $bits (loop $each
        (br_if $bits (i32.eqz (local.get $m)))
        ;; next token starts after the lowest \n: index via clz (V8 arm64 calls out for ctz)
        (local.set $o (i32.add (local.get $o) (i32.const 4)))
        (i32.store (local.get $o) (i32.sub
          (i32.add (i32.sub (local.get $p) (local.get $src)) (i32.const 32))
          (i32.clz (i32.and (local.get $m) (i32.sub (i32.const 0) (local.get $m))))))
        (local.set $m (i32.and (local.get $m) (i32.sub (local.get $m) (i32.const 1))))
        (br $each)))
      (local.set $p (i32.add (local.get $p) (i32.const 32)))
      (br $chunks)))
    ;; the end sentinel, unless the text ends with \n (then it is stored already)
    (if (i32.ne (i32.load (local.get $o)) (i32.sub (local.get $end) (local.get $src)))
      (then
        (local.set $o (i32.add (local.get $o) (i32.const 4)))
        (i32.store (local.get $o) (i32.sub (local.get $end) (local.get $src)))))
    (i32.shr_u (i32.sub (local.get $o) (local.get $offs)) (i32.const 2))
  )

  ;; allocate + clear the intern table for $total tokens (load factor <= 1/2)
  (func $internInit (param $total i32) (result i32)
    (local $cap i32) (local $bytes i32)
    ;; Warning: above 2^28 tokens cap*8 (and the probe's idx*8) wraps i32; the
    ;; 2^27 cap keeps the table <= 2 GiB
    (if (i32.gt_u (local.get $total) (i32.const 0x08000000))
      (then
        (call $oom)
        (return (i32.const 0))))
    ;; smallest 2^n >= max(16, 2*total); $total=0 -> 1-slot (shift wraps to 0); never probed
    (local.set $cap (i32.shl (i32.const 1)
      (i32.sub (i32.const 32) (i32.clz (i32.or
        (i32.sub (i32.shl (local.get $total) (i32.const 1)) (i32.const 1))
        (i32.const 15))))))
    (local.set $bytes (i32.shl (local.get $cap) (i32.const 3)))
    (global.set $tabBase (call $alloc (local.get $bytes)))
    (if (i32.eqz (global.get $tabBase)) (then (return (i32.const 0))))
    (memory.fill (global.get $tabBase) (i32.const 0) (local.get $bytes))
    (global.set $tabMask (i32.sub (local.get $cap) (i32.const 1)))
    (i32.const 1)
  )

  ;; map every token in $offs to an id (equal bytes = equal id). A key of up to 3
  ;; bytes is its own id: bytes | len << 24. Longer keys get their table slot
  ;; | 1 << 31. With $trim (jsdiff ignoreWhitespace), a pre-pass trims each
  ;; token's leading and trailing JS `trim()` whitespace: key starts go to $ids
  ;; (each read before its id overwrites it), key ends to a new array. The id loop
  ;; reads key bounds from two arrays either way, so the default path pays no trim
  ;; branch or call per token. OOM returns early with $err set.
  (func $internAll (param $src i32) (param $offs i32) (param $count i32) (param $ids i32) (param $trim i32)
    (local $ptr i32) (local $len i32) (local $idx i32) (local $slot i32) (local $next i32)
    (local $base i32) (local $mask i32) (local $ks i32) (local $ke i32) (local $i i32) (local $q i32)
    (local.set $ks (local.get $offs))
    (local.set $ke (i32.add (local.get $offs) (i32.const 4)))
    (if (local.get $trim)
      (then
        (local.set $ks (local.get $ids))
        (local.set $ke (call $alloc (i32.shl (local.get $count) (i32.const 2))))
        (if (i32.eqz (local.get $ke)) (then (return)))
        (block $trimmed (loop $keys
          (br_if $trimmed (i32.ge_u (local.get $i) (local.get $count)))
          (local.set $q (i32.add (local.get $offs) (i32.shl (local.get $i) (i32.const 2))))
          (local.set $ptr (i32.add (local.get $src) (i32.load (local.get $q))))
          (local.set $next (i32.add (local.get $src) (i32.load offset=4 (local.get $q))))
          (loop $lead
            (if (i32.lt_u (local.get $ptr) (local.get $next))
              (then
                (if (call $isTrimSpace (local.get $ptr) (local.get $next))
                  (then
                    (local.set $ptr (i32.add (local.get $ptr) (global.get $cpLen)))
                    (br $lead))))))
          (block $trail (loop $back
            (br_if $trail (i32.le_u (local.get $next) (local.get $ptr)))
            ;; step back over 10xxxxxx bytes to the last code point's lead (input is WTF-8)
            (local.set $q (local.get $next))
            (loop $cont
              (local.set $q (i32.sub (local.get $q) (i32.const 1)))
              (br_if $cont (i32.eq
                (i32.and (i32.load8_u (local.get $q)) (i32.const 0xC0))
                (i32.const 0x80))))
            (br_if $trail (i32.eqz (call $isTrimSpace (local.get $q) (local.get $next))))
            (local.set $next (local.get $q))
            (br $back)))
          (local.set $q (i32.shl (local.get $i) (i32.const 2)))
          (i32.store (i32.add (local.get $ids) (local.get $q)) (i32.sub (local.get $ptr) (local.get $src)))
          (i32.store (i32.add (local.get $ke) (local.get $q)) (i32.sub (local.get $next) (local.get $src)))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $keys)))))
    (local.set $base (global.get $tabBase))
    (local.set $mask (global.get $tabMask))
    (block $done (loop $each
      (br_if $done (i32.eqz (local.get $count)))
      (local.set $count (i32.sub (local.get $count) (i32.const 1)))
      (local.set $ptr (i32.add (local.get $src) (i32.load (local.get $ks))))
      (local.set $len (i32.sub (i32.add (local.get $src) (i32.load (local.get $ke))) (local.get $ptr)))
      (block $stored
        ;; the i32 load may overread the key into later text or the pad
        (local.set $idx (i32.or
          (i32.and
            (i32.load (local.get $ptr))
            (i32.sub (i32.shl (i32.const 1) (i32.shl (local.get $len) (i32.const 3))) (i32.const 1)))
          (i32.shl (local.get $len) (i32.const 24))))
        (br_if $stored (i32.lt_u (local.get $len) (i32.const 4)))
        (local.set $idx
          (i32.and (call $hashToken (local.get $ptr) (local.get $len)) (local.get $mask)))
        (block $found (loop $probe
          (local.set $slot (i32.add (local.get $base) (i32.shl (local.get $idx) (i32.const 3))))
          (if (i32.eqz (i32.load (local.get $slot)))
            (then ;; empty slot: insert ($ptr is never 0, the text starts on page 2)
              (i32.store (local.get $slot) (local.get $ptr))
              (i32.store offset=4 (local.get $slot) (local.get $len))
              (br $found)))
          (if (i32.eq (i32.load offset=4 (local.get $slot)) (local.get $len))
            (then
              (br_if $found
                (call $memcmp (i32.load (local.get $slot)) (local.get $ptr) (local.get $len)))))
          (local.set $idx (i32.and (i32.add (local.get $idx) (i32.const 1)) (local.get $mask)))
          (br $probe)))
        (local.set $idx (i32.or (local.get $idx) (i32.const 0x80000000))))
      (i32.store (local.get $ids) (local.get $idx))
      (local.set $ks (i32.add (local.get $ks) (i32.const 4)))
      (local.set $ke (i32.add (local.get $ke) (i32.const 4)))
      (local.set $ids (i32.add (local.get $ids) (i32.const 4)))
      (br $each)))
  )

  ;; inputs (set by the driver in patch.wat; the old text base is fixed)
  (global $oldSrc   i32       (i32.const 65536))
  (global $newSrc   (mut i32) (i32.const 0))
  (global $oldOffsB (mut i32) (i32.const 0))
  (global $newOffsB (mut i32) (i32.const 0))
  (global $oldIdsB  (mut i32) (i32.const 0))
  (global $newIdsB  (mut i32) (i32.const 0))
  (global $oldN     (mut i32) (i32.const 0))
  (global $newN     (mut i32) (i32.const 0))

  ;; outputs of $buildComps
  (global $compArr  (mut i32) (i32.const 0))
  (global $compN    (mut i32) (i32.const 0))

  ;; Node bytes before the first compaction and after it. Below the first bar a diff
  ;; pays nothing; the copy walks every new node, so a first run costs far more than
  ;; the bump allocations. After it, a small bar is fastest because the nodes stay in
  ;; cache. The bar also stays >= 2 * live bytes, so runs are amortized O(new nodes).
  ;; $nodeLim is the address where $myers next calls $reserveNodes.
  (global $compactFirst i32       (i32.const 0x10000000))
  (global $compactMin   i32       (i32.const 0x400000))
  (global $compactAt    (mut i32) (i32.const 0))
  (global $nodeLim      (mut i32) (i32.const 0))

  ;; Make room for $t node bytes and return the new node top, or 0 on oom.
  ;; Most nodes die as diagonals move on, but the bump pointer keeps them: unrelated
  ;; inputs would reach 2*D^2 bytes where jsdiff's GC holds O(D). So past the bar, copy
  ;; the paths of bestPath entries [$entry, $last] above $top, joining each added or
  ;; removed run into one node, and slide them down to $base, the first node. A copy
  ;; is always kind 0: (prev link, flags | count). A source node's first word becomes
  ;; copy | 3 (no link has kind 3), so paths that branch at a run boundary stay
  ;; shared, as jsdiff's components do.
  ;; Warning: keep this out of $myers: its size there slows the diagonal loop.
  (func $reserveNodes (param $top i32) (param $t i32) (param $entry i32) (param $last i32) (param $base i32) (result i32)
    (local $start i32) (local $to i32) (local $lim i32) (local $delta i32) (local $slot i32)
    (local $link i32) (local $node i32) (local $next i32) (local $run i32) (local $v i32)
    (if (i32.gt_u
          (i32.add (i32.sub (local.get $top) (local.get $base)) (local.get $t))
          (global.get $compactAt))
      (then
        (global.set $heap (local.get $top))
        (local.set $start (call $alloc (i32.const 8)))
        (if (i32.eqz (local.get $start)) (then (return (i32.const 0))))
        (local.set $to (local.get $start))
        (local.set $lim (global.get $memEnd))
        ;; links hold final addresses: physical copy address - $delta
        (local.set $delta (i32.sub (local.get $start) (local.get $base)))
        (block $done (loop $roots
          (br_if $done (i32.gt_u (local.get $entry) (local.get $last)))
          (if (i32.ne (i32.load (local.get $entry)) (i32.const 0x80808080))
            (then
              (local.set $slot (i32.add (local.get $entry) (i32.const 4)))
              (local.set $link (i32.load (local.get $slot)))
              (block $path (loop $walk
                (if (i32.eqz (local.get $link))
                  (then
                    (i32.store (local.get $slot) (i32.const 0))
                    (br $path)))
                (local.set $node (i32.and (local.get $link) (i32.const -4)))
                (local.set $next (i32.load (local.get $node)))
                (if (i32.eq (i32.and (local.get $next) (i32.const 3)) (i32.const 3))
                  (then
                    (i32.store (local.get $slot) (i32.and (local.get $next) (i32.const -4)))
                    (br $path)))
                (if (i32.gt_u (i32.const 8) (i32.sub (local.get $lim) (local.get $to)))
                  (then
                    (global.set $heap (local.get $to))
                    (if (i32.eqz (call $alloc (i32.const 8))) (then (return (i32.const 0))))
                    (local.set $lim (global.get $memEnd))))
                (local.set $v (i32.sub (local.get $to) (local.get $delta)))
                (i32.store (local.get $slot) (local.get $v))
                (i32.store (local.get $node) (i32.or (local.get $v) (i32.const 3)))
                (local.set $run (select
                  (i32.or (i32.shl (local.get $link) (i32.const 30)) (i32.const 1))
                  (i32.load offset=4 (local.get $node))
                  (i32.and (local.get $link) (i32.const 3))))
                (local.set $link (local.get $next))
                (block $joined (loop $join
                  (br_if $joined (i32.eqz (local.get $link)))
                  (local.set $node (i32.and (local.get $link) (i32.const -4)))
                  (local.set $v (select
                    (i32.or (i32.shl (local.get $link) (i32.const 30)) (i32.const 1))
                    (i32.load offset=4 (local.get $node))
                    (i32.and (local.get $link) (i32.const 3))))
                  (br_if $joined (i32.shr_u (i32.xor (local.get $v) (local.get $run)) (i32.const 30)))
                  (local.set $next (i32.load (local.get $node)))
                  (if (i32.eq (i32.and (local.get $next) (i32.const 3)) (i32.const 3))
                    (then ;; an older part of this run is already copied: end on its count and link
                      (local.set $v (i32.add (i32.and (local.get $next) (i32.const -4)) (local.get $delta)))
                      (i32.store (local.get $to) (i32.load (local.get $v)))
                      (i32.store offset=4 (local.get $to) (i32.add
                        (local.get $run)
                        (i32.and (i32.load offset=4 (local.get $v)) (i32.const 0x3FFFFFFF))))
                      (local.set $to (i32.add (local.get $to) (i32.const 8)))
                      (br $path)))
                  (local.set $run (i32.add (local.get $run) (i32.and (local.get $v) (i32.const 0x3FFFFFFF))))
                  (local.set $link (local.get $next))
                  (br $join)))
                (i32.store offset=4 (local.get $to) (local.get $run))
                (local.set $slot (local.get $to))
                (local.set $to (i32.add (local.get $to) (i32.const 8)))
                (br $walk)))))
          (local.set $entry (i32.add (local.get $entry) (i32.const 8)))
          (br $roots)))
        (local.set $v (i32.sub (local.get $to) (local.get $start)))
        (memory.copy (local.get $base) (local.get $start) (local.get $v))
        (local.set $top (i32.add (local.get $base) (local.get $v)))
        (local.set $v (i32.shl (local.get $v) (i32.const 1)))
        (global.set $compactAt (select
          (local.get $v)
          (global.get $compactMin)
          (i32.gt_u (local.get $v) (global.get $compactMin))))))
    (if (i32.gt_u (local.get $t) (i32.sub (global.get $memEnd) (local.get $top)))
      (then
        (global.set $heap (local.get $top))
        (if (i32.eqz (call $alloc (local.get $t))) (then (return (i32.const 0))))))
    (global.set $nodeLim (global.get $memEnd))
    ;; Warning: stop at the bar, so a compaction has free memory above $top for its
    ;; copies; without it, each run grows memory by 25%
    (local.set $v (i32.sub
      (i32.add (local.get $base) (global.get $compactAt))
      (local.get $top)))
    (if (i32.and
          (i32.gt_u (local.get $v) (local.get $t))
          (i32.lt_u (local.get $v) (i32.sub (global.get $memEnd) (local.get $top))))
      (then (global.set $nodeLim (i32.add (local.get $top) (local.get $v)))))
    (local.get $top)
  )

  ;; jsdiff Myers over interned ids. Last link of the finished path (0 = empty),
  ;; or 0 with $err. bestPath: 8-byte (oldPos, lastComponent); oldPos
  ;; 0x80808080 = undefined, matching jsdiff's sparse array. Entries are set
  ;; undefined lazily, two per edit length, so setup is O(D) like jsdiff, not O(M+N).
  ;; Paths share immutable nodes, as jsdiff's component objects. A link is a node
  ;; address | its kind: 0 common (prev link, count), 1 removed or 2 added (prev
  ;; link; one token). $reserveNodes also writes kind 0 nodes that hold flags | count.
  ;; Link 0 is the empty path. The diagonal loop makes no calls (V8 spills every
  ;; live value around one): nodes bump from $top, with room reserved once per row.
  (func $myers (result i32)
    (local $M i32) (local $N i32) (local $maxEdit i32) (local $size i32)
    (local $bpZero i32) (local $d i32) (local $k i32) (local $kEnd i32)
    (local $minDiag i32) (local $maxDiag i32)
    (local $remOldPos i32) (local $addOldPos i32) (local $canAdd i32) (local $canRemove i32)
    (local $useAdd i32) (local $oldPos i32) (local $comp i32) (local $cf i32)
    (local $t i32) (local $ea i32) (local $nEnd i32)
    (local $top i32) (local $lim i32) (local $oi i32) (local $ni i32)
    (local $po i32) (local $pn i32) (local $eo i32) (local $v v128)
    (global.set $compactAt (global.get $compactFirst))
    (local.set $M (global.get $oldN))
    (local.set $N (global.get $newN))
    (local.set $maxEdit (i32.add (local.get $M) (local.get $N)))
    ;; Warning: ($maxEdit+3)<<4 (bestPath + seed room) wraps i32 past this (under the
    ;; byte cap, e.g. two 128 MiB diffChars inputs); such a bestPath needs >= 4 GiB,
    ;; so it is OOM anyway
    (if (i32.gt_u (local.get $maxEdit) (i32.const 0x0FFFFFFC))
      (then
        (call $oom)
        (return (i32.const 0))))
    ;; bestPath, then 16 bytes of node room for the seed row
    (local.set $size (i32.shl (i32.add (local.get $maxEdit) (i32.const 2)) (i32.const 4)))
    (local.set $top (call $alloc (i32.add (local.get $size) (i32.const 16))))
    (if (i32.eqz (local.get $top)) (then (return (i32.const 0))))
    ;; $bpZero = bestPath[-1], so $ea = bestPath[k-1]; neighbour accesses are static offsets
    (local.set $bpZero (i32.add (local.get $top) (i32.shl (local.get $maxEdit) (i32.const 3))))
    (local.set $ea (local.get $bpZero))
    (local.set $top (i32.add (local.get $top) (local.get $size)))
    (local.set $lim (global.get $memEnd))
    ;; bestPath[-1] and [1] undefined; row d adds [-(d+1)] and [d+1], its only new reads
    (i32.store (local.get $bpZero) (i32.const 0x80808080))
    (i32.store offset=16 (local.get $bpZero) (i32.const 0x80808080))
    ;; $oi + 4*oldPos = &oldIds[oldPos+1], $ni likewise for new
    (local.set $oi (i32.add (global.get $oldIdsB) (i32.const 4)))
    (local.set $ni (i32.add (global.get $newIdsB) (i32.const 4)))
    (local.set $minDiag (i32.const -0x40000000))
    (local.set $maxDiag (i32.const 0x40000000))
    ;; the seed: diagonal 0 at oldPos -1 with an empty path ($d, $k, $kEnd, $comp are 0)
    (local.set $oldPos (i32.const -1))
    (loop $visit
      ;; jsdiff extractCommon. Most steps have no common run, so one id compare
      ;; skips the scan. Reads may pass an id array end (the next allocation follows);
      ;; the run is clamped to min(M-oldPos-1, N-newPos-1) with newPos = oldPos-k.
      (local.set $po (i32.add (local.get $oi) (i32.shl (local.get $oldPos) (i32.const 2))))
      (local.set $pn (i32.add
        (local.get $ni)
        (i32.shl (i32.sub (local.get $oldPos) (local.get $k)) (i32.const 2))))
      (if (i32.eq (i32.load (local.get $po)) (i32.load (local.get $pn)))
        (then
          (local.set $t (i32.sub (i32.sub (local.get $M) (local.get $oldPos)) (i32.const 1)))
          (local.set $eo (i32.sub
            (i32.add (i32.sub (local.get $N) (local.get $oldPos)) (local.get $k))
            (i32.const 1)))
          (if (i32.lt_s (local.get $eo) (local.get $t)) (then (local.set $t (local.get $eo))))
          (local.set $eo (i32.add (local.get $po) (i32.shl (local.get $t) (i32.const 2))))
          (local.set $t (local.get $po))
          ;; 4 ids per step; $po stops at the first unequal id
          (block $run (loop $wide
            (br_if $run (i32.ge_u (local.get $po) (local.get $eo)))
            (local.set $v (i32x4.eq (v128.load (local.get $po)) (v128.load (local.get $pn))))
            (if (i32.eqz (i32x4.all_true (local.get $v)))
              (then
                ;; + 4 * index of the lowest 0 bit, via clz (V8 arm64 calls out for ctz)
                (local.set $cf (i32x4.bitmask (local.get $v)))
                (local.set $po (i32.sub
                  (i32.add (local.get $po) (i32.const 124))
                  (i32.shl
                    (i32.clz (i32.and
                      (i32.add (local.get $cf) (i32.const 1))
                      (i32.xor (local.get $cf) (i32.const -1))))
                    (i32.const 2))))
                (br $run)))
            (local.set $po (i32.add (local.get $po) (i32.const 16)))
            (local.set $pn (i32.add (local.get $pn) (i32.const 16)))
            (br $wide)))
          (local.set $t (i32.shr_u
            (i32.sub
              (select (local.get $eo) (local.get $po) (i32.gt_u (local.get $po) (local.get $eo)))
              (local.get $t))
            (i32.const 2)))
          (if (local.get $t)
            (then
              (local.set $oldPos (i32.add (local.get $oldPos) (local.get $t)))
              (i32.store (local.get $top) (local.get $comp))
              (i32.store offset=4 (local.get $top) (local.get $t))
              (local.set $comp (local.get $top))
              (local.set $top (i32.add (local.get $top) (i32.const 8)))))))

      (local.set $nEnd (i32.ge_s
        (i32.add (i32.sub (local.get $oldPos) (local.get $k)) (i32.const 1))
        (local.get $N)))
      (if (i32.ge_s (i32.add (local.get $oldPos) (i32.const 1)) (local.get $M))
        (then
          ;; reached the end of both
          (if (local.get $nEnd)
            (then
              (global.set $heap (local.get $top))
              (return (local.get $comp))))
          ;; hit the bottom edge: higher diagonals can no longer win (jsdiff skips the seed)
          (local.set $t (i32.sub (local.get $k) (i32.const 1)))
          ;; kEnd = min(maxDiag, d) drops to it too ($t < k <= kEnd)
          (if (i32.and (i32.lt_s (local.get $t) (local.get $maxDiag)) (i32.ne (local.get $d) (i32.const 0)))
            (then
              (local.set $maxDiag (local.get $t))
              (local.set $kEnd (local.get $t))))))
      (i32.store offset=8 (local.get $ea) (local.get $oldPos))
      (i32.store offset=12 (local.get $ea) (local.get $comp))
      (if (local.get $nEnd)
        (then ;; hit the right edge: lower diagonals can no longer win
          (local.set $t (i32.add (local.get $k) (i32.const 1)))
          (if (i32.and (i32.gt_s (local.get $t) (local.get $minDiag)) (i32.ne (local.get $d) (i32.const 0)))
            (then (local.set $minDiag (local.get $t))))))
      (local.set $k (i32.add (local.get $k) (i32.const 2)))
      (loop $next
        (if (i32.gt_s (local.get $k) (local.get $kEnd))
          (then ;; next edit length
            (local.set $d (i32.add (local.get $d) (i32.const 1)))
            ;; impossible for a correct implementation
            (if (i32.gt_s (local.get $d) (local.get $maxEdit)) (then (unreachable)))
            (i32.store
              (i32.sub (local.get $bpZero) (i32.shl (local.get $d) (i32.const 3)))
              (i32.const 0x80808080))
            (i32.store offset=16
              (i32.add (local.get $bpZero) (i32.shl (local.get $d) (i32.const 3)))
              (i32.const 0x80808080))
            ;; k = max(minDiag, -d), evaluated once per edit length (as in jsdiff)
            (local.set $k (i32.sub (i32.const 0) (local.get $d)))
            (if (i32.gt_s (local.get $minDiag) (local.get $k))
              (then (local.set $k (local.get $minDiag))))
            ;; kEnd = min(maxDiag, d): jsdiff re-evaluates it per diagonal, and the
            ;; maxDiag update below keeps it in step
            (local.set $kEnd (local.get $d))
            (if (i32.lt_s (local.get $maxDiag) (local.get $kEnd))
              (then (local.set $kEnd (local.get $maxDiag))))
            ;; node room for the row: <= d+1 steps of <= 12 node bytes. Memory ends at
            ;; 4 GiB; $lim 0 there makes $lim-$top the room left.
            (local.set $t (i32.shl (i32.add (local.get $d) (i32.const 1)) (i32.const 4)))
            (if (i32.gt_u (local.get $t) (i32.sub (local.get $lim) (local.get $top)))
              (then
                ;; only bestPath[k-1 .. kEnd+1] can be read from now on; the first node
                ;; follows bestPath
                (local.set $top (call $reserveNodes
                  (local.get $top)
                  (local.get $t)
                  (i32.add (local.get $bpZero) (i32.shl (local.get $k) (i32.const 3)))
                  (i32.add
                    (i32.add (local.get $bpZero) (i32.shl (local.get $kEnd) (i32.const 3)))
                    (i32.const 16))
                  (i32.add
                    (i32.add (local.get $bpZero) (i32.shl (local.get $maxEdit) (i32.const 3)))
                    (i32.const 32))))
                (if (i32.eqz (local.get $top)) (then (return (i32.const 0))))
                (local.set $lim (global.get $nodeLim))))
            (br $next)))
        (local.set $ea (i32.add (local.get $bpZero) (i32.shl (local.get $k) (i32.const 3))))
        ;; load both neighbours always: undef oldPos 0x80808080 fails the unsigned
        ;; pos tests (M,N < 2^28, so real negatives are out of range too). Restoring
        ;; undef over undefined bestPath[k-1] is a no-op.
        (local.set $remOldPos (i32.load (local.get $ea)))
        (i32.store (local.get $ea) (i32.const 0x80808080))
        (local.set $addOldPos (i32.load offset=16 (local.get $ea)))
        ;; canAdd: 0 <= addOldPos - k (the newPos after an insertion) < N
        (local.set $canAdd
          (i32.lt_u (i32.sub (local.get $addOldPos) (local.get $k)) (local.get $N)))
        (local.set $canRemove
          (i32.lt_u (i32.add (local.get $remOldPos) (i32.const 1)) (local.get $M)))
        (if (i32.eqz (i32.or (local.get $canAdd) (local.get $canRemove)))
          (then ;; terminal path: prune
            (i32.store offset=8 (local.get $ea) (i32.const 0x80808080))
            (local.set $k (i32.add (local.get $k) (i32.const 2)))
            (br $next))))
      ;; branch from the prior path whose oldPos is farthest from the origin
      (local.set $useAdd (i32.or
        (i32.eqz (local.get $canRemove))
        (i32.and
          (local.get $canAdd)
          (i32.lt_s (local.get $remOldPos) (local.get $addOldPos)))))
      (local.set $oldPos (select
        (local.get $addOldPos)
        (i32.add (local.get $remOldPos) (i32.const 1))
        (local.get $useAdd)))
      ;; jsdiff addToPath: a one-token node on the chosen path; $buildComps merges
      ;; runs of a flavor, as addToPath does
      (i32.store (local.get $top)
        (i32.load offset=4 (i32.add (local.get $ea) (i32.shl (local.get $useAdd) (i32.const 4)))))
      (local.set $comp (i32.add (local.get $top) (i32.add (local.get $useAdd) (i32.const 1))))
      (local.set $top (i32.add (local.get $top) (i32.const 4)))
      (br $visit))
    (unreachable)
  )

  ;; flatten the reversed node list into $compArr (u32 count | added << 31 |
  ;; removed << 30, forward order). Adjacent added (or removed) nodes join, as
  ;; jsdiff addToPath merges a token into the last component of its flavor;
  ;; common runs never touch. Each node gives at most one component.
  (func $buildComps (param $last i32)
    (local $n i32) (local $c i32) (local $end i32) (local $p i32) (local $cf i32)
    (local.set $c (local.get $last))
    (block $counted (loop $count
      (br_if $counted (i32.eqz (local.get $c)))
      (local.set $n (i32.add (local.get $n) (i32.const 1)))
      (local.set $c (i32.load (i32.and (local.get $c) (i32.const -4))))
      (br $count)))
    ;; one slot past the end holds flags 11, which no node has, so nothing merges into it
    (local.set $p (call $alloc (i32.shl (i32.add (local.get $n) (i32.const 1)) (i32.const 2))))
    ;; 0 only on oom ($err set, the driver aborts)
    (if (i32.eqz (local.get $p)) (then (return)))
    (local.set $end (i32.add (local.get $p) (i32.shl (local.get $n) (i32.const 2))))
    (local.set $p (local.get $end))
    (i32.store (local.get $p) (i32.const -1))
    (local.set $c (local.get $last))
    (block $filled (loop $fill
      (br_if $filled (i32.eqz (local.get $c)))
      ;; flags | count: kind 1/2 is flags bit 30/31 and one token, kind 0 holds both
      (local.set $cf (select
        (i32.or (i32.shl (local.get $c) (i32.const 30)) (i32.const 1))
        (i32.load offset=4 (i32.and (local.get $c) (i32.const -4)))
        (i32.and (local.get $c) (i32.const 3))))
      (local.set $c (i32.and (local.get $c) (i32.const -4)))
      (if (i32.shr_u (i32.xor (i32.load (local.get $p)) (local.get $cf)) (i32.const 30))
        (then
          (local.set $p (i32.sub (local.get $p) (i32.const 4)))
          (i32.store (local.get $p) (local.get $cf)))
        (else ;; same flavor: add its tokens
          (i32.store (local.get $p) (i32.add
            (i32.load (local.get $p))
            (i32.and (local.get $cf) (i32.const 0x3FFFFFFF))))))
      (local.set $c (i32.load (local.get $c)))
      (br $fill)))
    (global.set $compArr (local.get $p))
    (global.set $compN (i32.shr_u (i32.sub (local.get $end) (local.get $p)) (i32.const 2)))
  )

  ;; jsdiff buildValues: 16-byte record per change — (flags 1 removed / 2 added /
  ;; 0 common, token count, start, end). start/end are UTF-16 units into old for
  ;; removals, new otherwise; host slices original JS strings, never decodes.
  ;; Removed/common tile old and added/common tile new, so per-side unit cursors
  ;; advance record-by-record. [3] bit 0/1 = old/new pure ASCII (units = bytes).
  ;; A common run is byte-equal on both sides (equal ids) unless ignoreWhitespace
  ;; ([3] bit 2): then it is ASCII if either side is, and the new side reuses the count.
  (func $emitRecords
    (local $i i32) (local $cf i32) (local $cnt i32) (local $base i32) (local $p i32)
    (local $flags i32) (local $ascii i32) (local $same i32)
    (local $oldTok i32) (local $newTok i32) (local $oldU i32) (local $newU i32)
    (local $oldEnd i32) (local $newEnd i32)
    (local.set $base (call $alloc (i32.shl (global.get $compN) (i32.const 4))))
    ;; 0 only on oom ($err set, the driver aborts)
    (if (i32.eqz (local.get $base)) (then (return)))
    (local.set $ascii (i32.load8_u (i32.const 3)))
    (local.set $p (local.get $base))
    (block $done (loop $each
      (br_if $done (i32.ge_u (local.get $i) (global.get $compN)))
      (local.set $cf
        (i32.load (i32.add (global.get $compArr) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $cnt (i32.and (local.get $cf) (i32.const 0x3FFFFFFF)))
      ;; the component flag bits are the record encoding: 1 removed, 2 added
      (local.set $flags (i32.shr_u (local.get $cf) (i32.const 30)))
      (local.set $same (i32.eqz (i32.or (local.get $flags) (i32.and (local.get $ascii) (i32.const 4)))))
      (local.set $oldEnd (local.get $oldU))
      (local.set $newEnd (local.get $newU))
      (if (i32.ne (local.get $flags) (i32.const 2))
        (then ;; removed or common: old tokens
          (local.set $oldEnd (i32.add (local.get $oldU) (call $utf16Units
            (global.get $oldSrc) (global.get $oldOffsB) (local.get $oldTok) (local.get $cnt)
            (i32.and (local.get $ascii) (select (i32.const 3) (i32.const 1) (local.get $same))))))
          (local.set $oldTok (i32.add (local.get $oldTok) (local.get $cnt)))))
      (if (i32.ne (local.get $flags) (i32.const 1))
        (then ;; added or common: new tokens
          (local.set $newEnd (i32.add (local.get $newU) (select
            (i32.sub (local.get $oldEnd) (local.get $oldU))
            (call $utf16Units
              (global.get $newSrc) (global.get $newOffsB) (local.get $newTok) (local.get $cnt)
              (i32.or (local.get $same) (i32.and (local.get $ascii) (i32.const 2))))
            (local.get $same))))
          (local.set $newTok (i32.add (local.get $newTok) (local.get $cnt)))))
      (i32.store (local.get $p) (local.get $flags))
      (i32.store offset=4 (local.get $p) (local.get $cnt))
      (i32.store offset=8 (local.get $p)
        (select (local.get $oldU) (local.get $newU) (i32.eq (local.get $flags) (i32.const 1))))
      (i32.store offset=12 (local.get $p)
        (select (local.get $oldEnd) (local.get $newEnd) (i32.eq (local.get $flags) (i32.const 1))))
      (local.set $oldU (local.get $oldEnd))
      (local.set $newU (local.get $newEnd))
      (local.set $p (i32.add (local.get $p) (i32.const 16)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    (i32.store (i32.const 12) (global.get $compN))
    (i32.store (i32.const 16) (local.get $base))
  )


  ;; C-quote a filename like Git/GNU diffutils iff it has a non-printable, quote,
  ;; or `\`; else copy it raw. One pass writes the quoted form after $p; a name
  ;; that needed no escape is copied raw over it.
  (func $quoteName (param $p i32) (param $s i32) (param $len i32) (result i32)
    (local $i i32) (local $b i32) (local $q i32) (local $raw i32)
    (local.set $q (i32.add (local.get $p) (i32.const 1)))
    (local.set $raw (i32.const 1))
    (block $done (loop $each
      (br_if $done (i32.ge_u (local.get $i) (local.get $len)))
      (local.set $b (i32.load8_u (i32.add (local.get $s) (local.get $i))))
      (block $next
        (block $pair ;; lands with $b = the letter after the backslash
          (if (i32.le_u (i32.sub (local.get $b) (i32.const 0x07)) (i32.const 6))
            (then ;; \a \b \t \n \v \f \r
              (local.set $b (i32.load8_u
                (i32.add (i32.const 1066) (i32.sub (local.get $b) (i32.const 0x07)))))
              (br $pair)))
          (br_if $pair (i32.or
            (i32.eq (local.get $b) (i32.const 0x22))
            (i32.eq (local.get $b) (i32.const 0x5C))))
          (if (i32.le_u (i32.sub (local.get $b) (i32.const 0x20)) (i32.const 0x5E))
            (then
              (i32.store8 (local.get $q) (local.get $b))
              (local.set $q (i32.add (local.get $q) (i32.const 1)))
              (br $next)))
          (local.set $raw (i32.const 0))
          ;; WTF-8 lone surrogate (ED A0..BF xx): quoted as U+FFFD, like jsdiff
          (if (i32.and
                (i32.eq (local.get $b) (i32.const 0xED))
                (i32.ge_u
                  (i32.load8_u offset=1 (i32.add (local.get $s) (local.get $i)))
                  (i32.const 0xA0)))
            (then
              (i64.store (local.get $q) (i64.const 0x3737325c3735335c))
              (i32.store offset=8 (local.get $q) (i32.const 0x3537325c))
              (local.set $q (i32.add (local.get $q) (i32.const 12)))
              (local.set $i (i32.add (local.get $i) (i32.const 2)))
              (br $next)))
          ;; anything else (UTF-8 bytes, control chars): 3-digit octal escape
          (i32.store8 (local.get $q) (i32.const 0x5C))
          (i32.store8 offset=1 (local.get $q)
            (i32.add (i32.const 48) (i32.shr_u (local.get $b) (i32.const 6))))
          (i32.store8 offset=2 (local.get $q) (i32.add
            (i32.const 48)
            (i32.and (i32.shr_u (local.get $b) (i32.const 3)) (i32.const 7))))
          (i32.store8 offset=3 (local.get $q)
            (i32.add (i32.const 48) (i32.and (local.get $b) (i32.const 7))))
          (local.set $q (i32.add (local.get $q) (i32.const 4)))
          (br $next))
        (local.set $raw (i32.const 0))
        (i32.store16 (local.get $q)
          (i32.or (i32.shl (local.get $b) (i32.const 8)) (i32.const 0x5C)))
        (local.set $q (i32.add (local.get $q) (i32.const 2))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    (if (local.get $raw)
      (then
        (memory.copy (local.get $p) (local.get $s) (local.get $len))
        (return (i32.add (local.get $p) (local.get $len)))))
    (i32.store8 (local.get $p) (i32.const 0x22))
    (i32.store8 (local.get $q) (i32.const 0x22))
    (i32.add (local.get $q) (i32.const 1))
  )

  ;; one ---/+++ line: 4-byte $prefix, quoted name, optional \t<header>, newline
  (func $emitFileLine
    (param $p i32) (param $prefix i32) (param $name i32) (param $nameLen i32)
    (param $hdr i32) (param $hdrLen i32) (result i32)
    (i32.store (local.get $p) (local.get $prefix))
    (local.set $p (call $quoteName
      (i32.add (local.get $p) (i32.const 4)) (local.get $name) (local.get $nameLen)))
    (if (local.get $hdrLen)
      (then
        (i32.store8 (local.get $p) (i32.const 0x09))
        (memory.copy (i32.add (local.get $p) (i32.const 1)) (local.get $hdr) (local.get $hdrLen))
        (local.set $p (i32.add (i32.add (local.get $p) (i32.const 1)) (local.get $hdrLen)))))
    (i32.store8 (local.get $p) (i32.const 0x0A))
    (i32.add (local.get $p) (i32.const 1))
  )

  ;; jsdiff formatPatch headers: Index: iff both names defined and byte-equal;
  ;; === underline; ---/+++ with optional \t<header>. Which lines: flags at [2]
  ;; (layout in mem.wat).
  (func $emitHeaders (param $p i32) (result i32)
    (local $flags i32)
    (local $onPtr i32) (local $onLen i32) (local $nnPtr i32) (local $nnLen i32)
    (local $ohPtr i32) (local $ohLen i32) (local $nhPtr i32) (local $nhLen i32)
    (local.set $flags (i32.load8_u (i32.const 2)))
    (local.set $onLen (i32.load (i32.const 28)))
    (local.set $nnLen (i32.load (i32.const 32)))
    (local.set $ohLen (i32.load (i32.const 36)))
    (local.set $nhLen (i32.load (i32.const 40)))
    (local.set $onPtr (i32.add (global.get $newSrc) (i32.load (i32.const 8))))
    (local.set $nnPtr (i32.add (local.get $onPtr) (local.get $onLen)))
    (local.set $ohPtr (i32.add (local.get $nnPtr) (local.get $nnLen)))
    (local.set $nhPtr (i32.add (local.get $ohPtr) (local.get $ohLen)))
    ;; Index: <oldFileName> raw (jsdiff does too), when includeIndex (bit 0) and both
    ;; names defined (bits 3+4)
    (if (i32.eq (i32.and (local.get $flags) (i32.const 25)) (i32.const 25))
      (then
        (if (i32.and
              (i32.eq (local.get $onLen) (local.get $nnLen))
              (call $memcmp (local.get $onPtr) (local.get $nnPtr) (local.get $onLen)))
          (then
            ;; literal's 8th byte at $p+7, immediately overwritten by the name (or \n if empty)
            (i64.store (local.get $p) (i64.const 0x20203a7865646e49))
            (memory.copy
              (i32.add (local.get $p) (i32.const 7)) (local.get $onPtr) (local.get $onLen))
            (local.set $p (i32.add (i32.add (local.get $p) (i32.const 7)) (local.get $onLen)))
            (i32.store8 (local.get $p) (i32.const 0x0A))
            (local.set $p (i32.add (local.get $p) (i32.const 1)))))))
    (if (i32.and (local.get $flags) (i32.const 2))
      (then
        (memory.fill (local.get $p) (i32.const 0x3D) (i32.const 67))
        (i32.store8 offset=67 (local.get $p) (i32.const 0x0A))
        (local.set $p (i32.add (local.get $p) (i32.const 68)))))
    ;; includeFileHeaders (bit 2) and both filenames defined (bits 3+4)
    (if (i32.eq (i32.and (local.get $flags) (i32.const 28)) (i32.const 28))
      (then
        (local.set $p (call $emitFileLine (local.get $p) (i32.const 0x202d2d2d)
          (local.get $onPtr) (local.get $onLen) (local.get $ohPtr) (local.get $ohLen)))
        (local.set $p (call $emitFileLine (local.get $p) (i32.const 0x202b2b2b)
          (local.get $nnPtr) (local.get $nnLen) (local.get $nhPtr) (local.get $nhLen)))))
    (local.get $p)
  )

  ;; "<start>,<lines>"; unified quirk: 0-length side reports start one lower
  (func $emitRange (param $p i32) (param $start i32) (param $lines i32) (result i32)
    (local.set $p (call $itoa (local.get $p)
      (i32.sub (local.get $start) (i32.eqz (local.get $lines)))))
    (i32.store8 (local.get $p) (i32.const 0x2C))
    (call $itoa (i32.add (local.get $p) (i32.const 1)) (local.get $lines))
  )

  ;; jsdiff structuredPatch + formatPatch over $compArr and a trailing empty common
  ;; sentinel. A change opens a hunk with up to $context lines of the previous
  ;; common run; a common run longer than 2*$context (or the last) closes it with
  ;; up to $context lines, and the hunk is written then. The 1-based line counters
  ;; are token cursors + 1 (a line advances iff its side's token does).
  ;; [16:20) = pointer, [20:24) = length.
  (func $emitPatch (param $context i32)
    (local $n i32) (local $i i32) (local $cf i32) (local $L i32) (local $prevL i32)
    (local $oldLine i32) (local $newLine i32) (local $open i32)
    (local $oldStart i32) (local $newStart i32) (local $spanComp i32) (local $spanOff i32)
    (local $ctxN i32) (local $out i32) (local $p i32)
    (local $j i32) (local $from i32) (local $to i32) (local $cj i32) (local $rm i32)
    (local $oldTok i32) (local $newTok i32) (local $offs i32) (local $src i32) (local $len i32)
    (local.set $n (global.get $compN))
    ;; worst case: every token once + per-line prefix + no-newline marker + hunk
    ;; headers (<= 64 bytes, <= one per component) + file headers (each filename
    ;; byte <= 4x quoted, plus once raw in "Index:"); text lengths from [4]/[8]
    (local.set $out (call $alloc (i32.add
      (i32.add
        (i32.add
          (i32.shl (i32.add (local.get $n) (i32.const 4)) (i32.const 6))
          (i32.shl (i32.add (global.get $oldN) (global.get $newN)) (i32.const 5)))
        (i32.add (i32.load (i32.const 4)) (i32.load (i32.const 8))))
      (i32.add
        (i32.mul (i32.add (i32.load (i32.const 28)) (i32.load (i32.const 32))) (i32.const 5))
        (i32.add (i32.load (i32.const 36)) (i32.load (i32.const 40)))))))
    (if (i32.eqz (local.get $out)) (then (return)))
    (local.set $p (call $emitHeaders (local.get $out)))
    (local.set $oldLine (i32.const 1))
    (local.set $newLine (i32.const 1))
    (block $done (loop $each
      (br_if $done (i32.gt_s (local.get $i) (local.get $n)))
      ;; component $i, or 0 for the sentinel at $i = $n
      (local.set $cf (i32.const 0))
      (if (i32.lt_s (local.get $i) (local.get $n))
        (then
          (local.set $cf
            (i32.load (i32.add (global.get $compArr) (i32.shl (local.get $i) (i32.const 2)))))))
      ;; shift/sign bit-30/31 tests encode smaller than 5-byte LEB masks
      (local.set $L (i32.shr_u (i32.shl (local.get $cf) (i32.const 2)) (i32.const 2)))
      (if (i32.shr_u (local.get $cf) (i32.const 30))
        (then ;; added or removed
          (if (i32.eqz (local.get $open))
            (then ;; the previous component is common; $prevL is 0 at $i = 0
              (local.set $open (i32.const 1))
              (local.set $ctxN (select
                (local.get $context)
                (local.get $prevL)
                (i32.lt_s (local.get $context) (local.get $prevL))))
              ;; -1 at $i = 0 reads as the empty sentinel below
              (local.set $spanComp (i32.sub (local.get $i) (i32.const 1)))
              (local.set $spanOff (i32.sub (local.get $prevL) (local.get $ctxN)))
              (local.set $oldStart (i32.sub (local.get $oldLine) (local.get $ctxN)))
              (local.set $newStart (i32.sub (local.get $newLine) (local.get $ctxN)))))
          ;; bit 31: added
          (if (i32.lt_s (local.get $cf) (i32.const 0))
            (then (local.set $newLine (i32.add (local.get $newLine) (local.get $L))))
            (else (local.set $oldLine (i32.add (local.get $oldLine) (local.get $L))))))
        (else
          ;; a short interior common run keeps the hunk open (overlap)
          (if (i32.and
                (local.get $open)
                (i32.eqz (i32.and
                  (i32.le_s (local.get $L) (i32.shl (local.get $context) (i32.const 1)))
                  (i32.lt_s (local.get $i) (i32.sub (local.get $n) (i32.const 1))))))
            (then ;; close the hunk with up to $context trailing lines and write it
              (local.set $open (i32.const 0))
              (local.set $ctxN (select
                (local.get $context)
                (local.get $L)
                (i32.lt_s (local.get $context) (local.get $L))))
              ;; "@@ -a,b +c,d @@\n" via multi-byte literal stores
              (i32.store (local.get $p) (i32.const 0x2d204040))
              (local.set $p (call $emitRange
                (i32.add (local.get $p) (i32.const 4))
                (local.get $oldStart)
                (i32.add (i32.sub (local.get $oldLine) (local.get $oldStart)) (local.get $ctxN))))
              (i32.store16 (local.get $p) (i32.const 0x2b20))
              (local.set $p (call $emitRange
                (i32.add (local.get $p) (i32.const 2))
                (local.get $newStart)
                (i32.add (i32.sub (local.get $newLine) (local.get $newStart)) (local.get $ctxN))))
              (i32.store (local.get $p) (i32.const 0x0a404020))
              (local.set $p (i32.add (local.get $p) (i32.const 4)))
              ;; lines from $spanOff of $spanComp up to $ctxN of $i
              (local.set $j (local.get $spanComp))
              (local.set $from (local.get $spanOff))
              (local.set $oldTok (i32.sub (local.get $oldStart) (i32.const 1)))
              (local.set $newTok (i32.sub (local.get $newStart) (i32.const 1)))
              (block $hunkDone (loop $comps
                (local.set $cj (i32.const 0))
                (if (i32.lt_u (local.get $j) (local.get $n))
                  (then
                    (local.set $cj (i32.load
                      (i32.add (global.get $compArr) (i32.shl (local.get $j) (i32.const 2)))))))
                (local.set $to (select
                  (local.get $ctxN)
                  (i32.shr_u (i32.shl (local.get $cj) (i32.const 2)) (i32.const 2))
                  (i32.eq (local.get $j) (local.get $i))))
                ;; bit 30: removed, a line of the old text
                (local.set $rm (i32.lt_s (i32.shl (local.get $cj) (i32.const 1)) (i32.const 0)))
                (local.set $src (select (global.get $oldSrc) (global.get $newSrc) (local.get $rm)))
                (block $linesDone (loop $lines
                  (br_if $linesDone (i32.ge_s (local.get $from) (local.get $to)))
                  ;; token [start,end) offsets at $offs
                  (local.set $offs (select
                    (i32.add (global.get $oldOffsB) (i32.shl (local.get $oldTok) (i32.const 2)))
                    (i32.add (global.get $newOffsB) (i32.shl (local.get $newTok) (i32.const 2)))
                    (local.get $rm)))
                  (i32.store8 (local.get $p) (select
                    (i32.const 0x2D)
                    (select (i32.const 0x2B) (i32.const 0x20) (i32.lt_s (local.get $cj) (i32.const 0)))
                    (local.get $rm)))
                  (local.set $len (i32.sub
                    (i32.load offset=4 (local.get $offs))
                    (i32.load (local.get $offs))))
                  (memory.copy
                    (i32.add (local.get $p) (i32.const 1))
                    (i32.add (local.get $src) (i32.load (local.get $offs)))
                    (local.get $len))
                  (local.set $p (i32.add (i32.add (local.get $p) (i32.const 1)) (local.get $len)))
                  (if (i32.ne
                        (i32.load8_u (i32.sub
                          (i32.add (local.get $src) (i32.load offset=4 (local.get $offs)))
                          (i32.const 1)))
                        (i32.const 0x0A))
                    (then ;; the file's unterminated last line
                      (memory.copy (local.get $p) (i32.const 1037) (i32.const 29))
                      (local.set $p (i32.add (local.get $p) (i32.const 29)))))
                  ;; removed and common lines consume an old token, added and common a new one
                  (local.set $oldTok
                    (i32.add (local.get $oldTok) (i32.ge_s (local.get $cj) (i32.const 0))))
                  (local.set $newTok (i32.add (local.get $newTok) (i32.eqz (local.get $rm))))
                  (local.set $from (i32.add (local.get $from) (i32.const 1)))
                  (br $lines)))
                (br_if $hunkDone (i32.eq (local.get $j) (local.get $i)))
                (local.set $from (i32.const 0))
                (local.set $j (i32.add (local.get $j) (i32.const 1)))
                (br $comps)))))
          (local.set $oldLine (i32.add (local.get $oldLine) (local.get $L)))
          (local.set $newLine (i32.add (local.get $newLine) (local.get $L)))))
      (local.set $prevL (local.get $L))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    ;; jsdiff joins lines with \n and appends one more, so a patch with no lines is "\n"
    (if (i32.eq (local.get $p) (local.get $out))
      (then
        (i32.store8 (local.get $p) (i32.const 0x0A))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))))
    (i32.store (i32.const 16) (local.get $out))
    (i32.store (i32.const 20) (i32.sub (local.get $p) (local.get $out)))
  )

  ;; entry: run the op at [0] over the inputs on page 1 (layout in mem.wat)
  (func (export "diff")
    (local $op i32) (local $oldLen i32) (local $newLen i32)
    (local $oldPtr i32) (local $newPtr i32) (local $newEnd i32)
    (local $strLen i32) (local $trim i32)
    (global.set $err (i32.const 0))
    (local.set $op (i32.load8_u (i32.const 0)))
    (local.set $oldLen (i32.load (i32.const 4)))
    (local.set $newLen (i32.load (i32.const 8)))
    (local.set $oldPtr (i32.const 65536))
    (local.set $newPtr (i32.add (local.get $oldPtr) (local.get $oldLen)))
    (local.set $newEnd (i32.add (local.get $newPtr) (local.get $newLen)))
    ;; op 3 carries the filename/header strings right after the new text
    (if (i32.eq (local.get $op) (i32.const 3))
      (then
        (local.set $strLen (i32.add
          (i32.add (i32.load (i32.const 28)) (i32.load (i32.const 32)))
          (i32.add (i32.load (i32.const 36)) (i32.load (i32.const 40)))))))
    (global.set $heap (i32.add (i32.add (local.get $newEnd) (local.get $strLen)) (i32.const 32)))
    (global.set $newSrc (local.get $newPtr))

    (block $abort
      ;; the byte cap keeps text and offset sizes in i32 (over-limit may leave $heap
      ;; garbage, but we abort); token-count tables check themselves ($internInit, $myers)
      (if (i32.or
            (i32.ge_u
              (i32.or (i32.or (local.get $oldLen) (local.get $newLen)) (local.get $strLen))
              (i32.const 0x10000000))
            (i32.eqz (call $ensure (global.get $heap))))
        (then
          (call $oom)
          (br $abort)))
      ;; every op tokenizes into an offset array (worst case one token per byte)
      (global.set $oldOffsB (call $alloc
        (i32.shl (i32.add (local.get $oldLen) (i32.const 2)) (i32.const 2))))
      (global.set $newOffsB (call $alloc
        (i32.shl (i32.add (local.get $newLen) (i32.const 2)) (i32.const 2))))
      (if (i32.eq (local.get $op) (i32.const 1))
        (then ;; chars: ids are the code points, no interning needed
          (global.set $oldIdsB (call $alloc
            (i32.shl (i32.add (local.get $oldLen) (i32.const 1)) (i32.const 2))))
          (global.set $newIdsB (call $alloc
            (i32.shl (i32.add (local.get $newLen) (i32.const 1)) (i32.const 2))))
          (br_if $abort (global.get $err))
          (global.set $oldN (call $tokenizeChars
            (local.get $oldPtr) (local.get $newPtr) (global.get $oldOffsB) (global.get $oldIdsB)))
          (global.set $newN (call $tokenizeChars
            (local.get $newPtr) (local.get $newEnd) (global.get $newOffsB) (global.get $newIdsB))))
        (else
          (br_if $abort (global.get $err))
          (if (i32.eq (local.get $op) (i32.const 2))
            (then
              (global.set $oldN (call $tokenizeWords
                (local.get $oldPtr) (local.get $newPtr) (global.get $oldOffsB)))
              (global.set $newN (call $tokenizeWords
                (local.get $newPtr) (local.get $newEnd) (global.get $newOffsB))))
            (else ;; ops 3 and 4 both diff line tokens
              (global.set $oldN (call $tokenizeLines
                (local.get $oldPtr) (local.get $newPtr) (global.get $oldOffsB)))
              (global.set $newN (call $tokenizeLines
                (local.get $newPtr) (local.get $newEnd) (global.get $newOffsB)))))
          ;; equal tokens get equal ids, so the diff loop compares one i32
          (br_if $abort (i32.eqz
            (call $internInit (i32.add (global.get $oldN) (global.get $newN)))))
          (global.set $oldIdsB (call $alloc (i32.shl (global.get $oldN) (i32.const 2))))
          (global.set $newIdsB (call $alloc (i32.shl (global.get $newN) (i32.const 2))))
          (br_if $abort (global.get $err))
          ;; [3] bit 2: ignoreWhitespace (the host sets it for line ops only)
          (local.set $trim (i32.and (i32.load8_u (i32.const 3)) (i32.const 4)))
          (call $internAll (local.get $oldPtr)
            (global.get $oldOffsB) (global.get $oldN) (global.get $oldIdsB) (local.get $trim))
          (call $internAll (local.get $newPtr)
            (global.get $newOffsB) (global.get $newN) (global.get $newIdsB) (local.get $trim))
          (br_if $abort (global.get $err))))

      ;; on error $myers returns 0 and $buildComps stores nothing that could
      ;; clobber the error words, so one err check covers both
      (call $buildComps (call $myers))
      (br_if $abort (global.get $err))
      (if (i32.eq (local.get $op) (i32.const 3))
        (then (call $emitPatch (i32.load (i32.const 24)))) ;; context line count
        (else (call $emitRecords)))
    )
    ;; success flag
    (i32.store8 (i32.const 1) (i32.eqz (global.get $err)))
  )
)
