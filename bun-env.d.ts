declare module "*.svg" {
  const path: `${string}.svg`;
  export = path;
}
declare module "*.css" {}
declare module "*.png" {
  const path: string;
  export default path;
}
