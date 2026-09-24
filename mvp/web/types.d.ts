declare module 'sql.js/dist/sql-wasm.js' {
  const initSqlJs: (config: { wasmBinary: Uint8Array }) => Promise<any>;
  export default initSqlJs;
}
declare module '*.wasm' {
  const bytes: Uint8Array;
  export default bytes;
}
