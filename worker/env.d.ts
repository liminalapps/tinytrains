// Data files are bundled as Text modules (see the city configs' "rules").
declare module '*.json' {
  const text: string;
  export default text;
}
