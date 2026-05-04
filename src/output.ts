export const listOutputs = (name: string, files: Array<string>): Record<string, string> => ({
  [name]: files.join(' '),
  [`${name}_json`]: JSON.stringify(files),
});
