# RelayCanvas

Editor dan simulator skema relay di browser.

Tanpa dependency, tanpa build, tanpa backend. Mesin dan UI dipisah supaya mesin bisa diuji tanpa DOM.

## Konsep singkat

- Rail adalah net sekaligus sumber tegangan dengan `Rsrc` seri, supaya matriks tidak singular dan arus hubung singkat tetap terhitung.
- Sambungan hanya terjadi di pin, tap rail, atau tap kabel. Persilangan tidak menyambung, dan digambar dengan lengkungan sebagai penanda.
- State kontak disimpan, tidak pernah dihitung ulang di tengah solve.
- Timer relay bukan komponen terpisah: isi `tOperate` atau `tRelease` pada koil.
