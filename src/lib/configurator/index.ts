// The configurator's pure logic (docs/DESIGN.md §5, docs/ARHITECTURA.md §7).
// Used by the client (UI, drawing) and by the server (validation, code and
// price recomputation, email, PNG). Components only display what it returns.
export * from "./types";
export * from "./catalog.seed";
export * from "./rules";
export * from "./geometry";
export * from "./format";
export * from "./pricing";
export * from "./url";
export * from "./scene";
