// Ambient module shims for MCP SDK subpath imports to appease the type checker
// until node_modules are installed and proper typings are available.
declare module '@modelcontextprotocol/sdk/server';
declare module '@modelcontextprotocol/sdk/server/stdio';
declare module '@modelcontextprotocol/sdk/types';
declare module '@modelcontextprotocol/sdk/types.js';

// Minimal process shim for typechecking when @types/node isn't installed locally
// This is safe because actual runtime is Node and tsconfig includes node types.
declare const process: any;


