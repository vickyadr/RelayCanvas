// Dense Gaussian elimination with partial pivoting. Returns null on a singular matrix.

export function solveLinear(A, b) {
  const n = b.length;
  if (n === 0) return new Float64Array(0);
  const M = A.map(row => Float64Array.from(row));
  const x = Float64Array.from(b);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmpRow = M[pivot];
      M[pivot] = M[col];
      M[col] = tmpRow;
      const tmpVal = x[pivot];
      x[pivot] = x[col];
      x[col] = tmpVal;
    }
    const diag = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c < n; c++) M[r][c] -= factor * M[col][c];
      x[r] -= factor * x[col];
    }
  }

  const out = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let sum = x[r];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * out[c];
    out[r] = sum / M[r][r];
  }
  return out;
}
