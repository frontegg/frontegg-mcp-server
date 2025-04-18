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

### 1. Configure your environment variables

Create a `.env` file in the root directory with your Frontegg credentials:

```env
FRONTEGG_CLIENT_ID=your_client_id
FRONTEGG_API_KEY=your_api_key
# Optional: Only needed if not using the default Frontegg URL (https://api.frontegg.com)
# FRONTEGG_BASE_URL=https://api.frontegg.com
```

Replace `your_client_id` and `your_api_key` with your actual Frontegg credentials from your Frontegg account settings.

### 2. Configure Claude Desktop to recognize the Frontegg MCP server

If you're using Claude Desktop, you'll need to configure it to recognize and connect to your Frontegg MCP server.

To locate the `claude_desktop_config.json` file:

1. Open the Claude Desktop app and enable Developer Mode from the top-left menu bar
2. Go to Settings, navigate to the Developer section, and click the Edit Config button to access `claude_desktop_config.json`

Alternatively, you can open the configuration file directly:

#### On macOS:

```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

#### On Windows:

```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

### 3. Add the Frontegg server configuration to Claude Desktop:

```json
{
  "mcpServers": {
    "frontegg": {
      "command": "node",
      "args": ["/path/to/frontegg-mcp-server/build/index.js"],
      "env": {
        "FRONTEGG_CLIENT_ID": "your_client_id",
        "FRONTEGG_API_KEY": "your_api_key"
        // FRONTEGG_BASE_URL is optional and defaults to https://api.frontegg.com
      }
    }
  }
}
```

Replace `/path/to/frontegg-mcp-server` with the absolute path to your project directory, and add your actual Frontegg credentials.

### 4. Restart Claude Desktop

To apply the changes:

1. Fully quit Claude Desktop (ensure it's not just minimized)
2. Relaunch Claude Desktop
3. Check for the 🔌 icon to confirm the Frontegg server is connected

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

## Model Context Protocol (MCP) Integration

This application acts as an MCP server (`@modelcontextprotocol/sdk/server`). It registers tools (defined in `./src/tools/`) that can be invoked by an MCP client (like an AI model or development tool).

The server uses `@modelcontextprotocol/sdk/server/stdio` for communication, meaning it expects MCP messages via stdin and sends responses via stdout.

To interact with this server using an MCP client, configure the client to launch the `frontegg-mcp-server` executable (or run `npm start` or `node build/index.js` in the project directory).

### Using with MCP Inspector

You can use the MCP Inspector tool to test and debug the server:

```bash
npm run inspector
```

This will start the server and open the MCP Inspector UI, allowing you to send requests and view responses.

## Tools

This server provides the following tools to interact with the Frontegg API:

**Applications**

1.  `get_users_for_application`: Retrieves users assigned to a specific application.
2.  `assign_users_to_application`: Assigns users to a specific application.

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
5.  `update_permissions_bulk`: Updates multiple permissions in a single request.
6.  `update_permissions_classification`: Updates permission classifications.

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
