/** Rive files are bundled assets (metro.config.js); importing one gives Metro's asset id, like `require`. */
declare module '*.riv' {
  const asset: number;
  export default asset;
}
