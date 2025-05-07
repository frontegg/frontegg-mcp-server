# Frontegg MCP Server

This project implements a Model Context Protocol (MCP) server that interacts with the Frontegg API.

## Prerequisites

- Node.js (version 18.0.0 or higher)
- npm or yarn

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd frontegg-mcp-server
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
    or
    ```bash
    yarn install
    ```

## Configuration

This server requires authentication with Frontegg. You need to set up proper configuration to connect your MCP server with Frontegg's API.

First, ensure you have your Frontegg credentials available.

### Configure your environment variables

Create a `.env` file in the root directory with your Frontegg credentials:

```env
FRONTEGG_CLIENT_ID=your_client_id
FRONTEGG_API_KEY=your_api_key
# Optional: Only needed if not using the default Frontegg URL (https://api.frontegg.com)
# FRONTEGG_BASE_URL=https://api.frontegg.com
```

Replace `your_client_id` and `your_api_key` with your actual Frontegg credentials from your Frontegg account settings.

## Running the Server

1.  Build the project:
    ```bash
    npm run build
    ```
2.  Start the MCP server:
    ```bash
    npm start
    ```

This will start the server, which listens for MCP connections via standard input/output (stdio).

### How to use with Claude Desktop

1.  **Locate Claude Desktop Config File**

    To locate the `claude_desktop_config.json` file:

    - Open the Claude Desktop app and enable Developer Mode from the top-left menu bar.
    - Go to Settings, navigate to the Developer section, and click the Edit Config button.

    Alternatively, open the file directly:

    - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
    - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2.  **Add Server Configuration**

    Add the following to the `mcpServers` section in `claude_desktop_config.json`:

    ```json
    {
      "mcpServers": {
        "frontegg": {
          "command": "npx",
          "args": ["@frontegg/frontegg-mcp-server"],
          "env": {
            "FRONTEGG_CLIENT_ID": "your_client_id",
            "FRONTEGG_API_KEY": "your_api_key"
            // FRONTEGG_BASE_URL is optional and defaults to https://api.frontegg.com
          }
        }
      }
    }
    ```

    Replace `/path/to/frontegg-mcp-server` with the absolute path to your project directory, and fill in your credentials.

3.  **Restart Claude Desktop**

    - Fully quit Claude Desktop.
    - Relaunch Claude Desktop.
    - Check for the 🔌 icon to confirm the server connection.

### How to use with Cursor AI

1.  **Create MCP Configuration File**

    You can configure Cursor per-project or globally.

    - **Project-level**: Create a `.cursor/mcp.json` file in the root of this project.
    - **Global**: Create a `~/.cursor/mcp.json` file in your home directory.

2.  **Add Server Configuration**

    Add the following content to your chosen `mcp.json` file:

    ```json
    {
      "mcpServers": {
        "frontegg": {
          "command": "npx",
          "args": ["@frontegg/frontegg-mcp-server"],
          "env": {
            "FRONTEGG_CLIENT_ID": "your_client_id",
            "FRONTEGG_API_KEY": "your_api_key"
            // FRONTEGG_BASE_URL is optional and defaults to https://api.frontegg.com
          }
        }
      }
    }
    ```

    Replace `your_client_id`, `your_api_key`. If using the global configuration, ensure the path in `args` points to the correct location of `build/index.js` (e.g., use an absolute path).

3.  **Restart/Reload Cursor**

    After saving the file, restart Cursor or reload the project/window to activate the MCP server.

## Running the Server

1.  Build the project:
    ```bash
    npm run build
    ```
2.  Start the MCP server:
    ```bash
    npm start
    ```

This will start the server, which listens for MCP connections via standard input/output (stdio).

## Running as an HTTP Server

Alternatively, you can run the server in HTTP mode. This mode exposes an HTTP endpoint (`/mcp`) that MCP clients can connect to over the network.

1.  Build the project (if not already done):
    ```bash
    npm run build
    ```
2.  Start the HTTP server:
    ```bash
    npm run start:http
    ```
    By default, the server listens on port 3000. You can change the port using the `PORT` environment variable or the `--port` command-line argument:
    ```bash
    PORT=8080 npm run start:http
    # or
    npm run start:http -- --port 8080
    ```
    _(Note the extra `--` before `--port` when using npm scripts)._

### Configuring Clients for HTTP Mode

When running in HTTP mode, clients like Claude Desktop need to connect to the server's URL (e.g., `http://localhost:3000/mcp`).

**Important:** The Claude Desktop configuration example provided earlier (`claude_desktop_config.json`) is for the **stdio** server. Configuring Claude Desktop (or other clients) to connect to an HTTP MCP server might require a different configuration structure (e.g., using a `url` field instead of `command`/`args`).

Consult your MCP client's documentation for instructions on connecting to an MCP server via an HTTP endpoint. You will typically need to provide the base URL where the server is listening (e.g., `http://localhost:3000`). The client will usually append `/mcp` automatically.

If direct URL configuration is not supported by your client, you may need to run the HTTP server manually in a separate terminal and then configure the client accordingly, if possible.

## Model Context Protocol (MCP) Integration

This application acts as an MCP server (`@modelcontextprotocol/sdk/server`). It registers tools (defined in `./src/tools/`) that can be invoked by an MCP client (like an AI model or development tool).

The server uses `@modelcontextprotocol/sdk/server/stdio` for communication, meaning it expects MCP messages via stdin and sends responses via stdout.

To interact with this server using an MCP client, configure the client to launch the `frontegg-mcp-server` executable (or run `npm start` or `node build/index.js` in the project directory).

## Tools

This server provides the following tools to interact with the Frontegg API:

**Applications**

1.  `get_users_for_application`: Retrieves users assigned to a specific application.
2.  `assign_users_to_application`: Assigns users to a specific application.
3.  `get_applications`: Fetches Frontegg applications with optional filters.
4.  `create_agent_application`: Creates a new agent application with specified configuration including name, URLs, access type, and AI-specific settings like model provider and orchestration platform.
5.  `update_agent_application`: Updates an existing agent application's configuration, allowing modification of properties like name, URLs, access settings, and AI integration settings.
6.  `get_agent_applications`: Fetches a list of agent applications with optional filtering by access type, default status, active status, or specific IDs.

**API Tokens**

1.  `create_api_token`: Creates a new API token.
2.  `delete_api_token`: Deletes an API token.
3.  `get_api_tokens`: Retrieves API tokens.

**Tenant Access Tokens**

1.  `create_token`: Creates a new tenant access token.
2.  `get_tokens`: Retrieves tenant access tokens.
3.  `delete_token`: Deletes a tenant access token.

**Client Credentials**

1.  `create_client_credentials`: Creates a new client credentials token.
2.  `get_client_credentials`: Retrieves client credentials tokens.
3.  `update_client_credentials`: Updates an existing client credentials token.
4.  `delete_client_credentials`: Deletes a client credentials token.

**Permissions**

1.  `create_permission`: Creates a new permission.
2.  `delete_permission`: Deletes a permission.
3.  `get_permissions`: Retrieves permissions.
4.  `update_permission`: Updates an existing permission.
5.  `set_permission_multiple-roles`: Associates a permission with multiple roles. Existing roles remain associated.
6.  `set_permissions_classification`: Sets the classification type (assignment rule: NEVER, ALWAYS, ASSIGNABLE) for specified permissions.
7.  `set_permissions_to_role`: Assigns permissions to a role, replacing any existing permissions.

**Permission Categories**

1.  `get_permission_categories`: Retrieves permission categories.
2.  `create_permission_category`: Creates a new permission category.
3.  `update_permission_category`: Updates an existing permission category.
4.  `delete_permission_category`: Deletes a permission category.

**Personal Tokens**

1.  `create_personal_token`: Creates a new personal API token.
2.  `delete_personal_token`: Deletes a personal API token.
3.  `get_personal_tokens`: Retrieves personal API tokens.

**Roles**

1.  `create_role`: Creates a new role.
2.  `delete_role`: Deletes a role.
3.  `get_roles`: Retrieves roles.
4.  `update_role`: Updates an existing role.

**Tenants**

1.  `create_tenant`: Creates a new tenant account.
2.  `update_tenant`: Updates an existing tenant account.
3.  `delete_tenant`: Deletes a tenant account.

**Users**

1.  `invite_user`: Invites a new user to a specified tenant.
2.  `delete_user`: Deletes a user.
3.  `get_users`: Retrieves users.
4.  `update_user`: Updates an existing user.

**Vendor Integrations**

1.  `get_vendor_integrations`: Fetches all vendor integrations.
2.  `create_vendor_integration`: Creates a new vendor integration.
3.  `update_vendor_integration`: Updates an existing vendor integration.
4.  `delete_vendor_integration`: Deletes a vendor integration.
5.  `assign_agents_to_vendor_integration`: Assigns agents to a vendor integration.
6.  `unassign_agents_from_vendor_integration`: Unassigns agents from a vendor integration.

**Frontegg Integrations**

1.  `get_frontegg_integrations`: Fetches all Frontegg integrations.
2.  `get_frontegg_integration`: Fetches a single Frontegg integration by ID.
