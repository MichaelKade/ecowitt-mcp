# Ecowitt MCP Server

MCP server for integrating Ecowitt weather stations with AI assistants. This fetches weather data using the [Ecowitt API](https://doc.ecowitt.net/web/#/apiv3en).

## Prerequisites

Requires a valid Ecowitt Application Key and API Key. Visit [Private Center in ecowitt.net](https://www.ecowitt.net/home/user) to create.

## MCP Configuration

```json
{
  "ecowitt": {
    "command": "npx -y ecowitt-mcp",
    "env": {
      "ECOWITT_APPLICATION_KEY": "your_app_key",
      "ECOWITT_API_KEY": "your_api_key"
    }
  }
}
```

## Private hosted deployment (HTTP)

`src/server/http.js` serves the same tools over MCP Streamable HTTP at `POST /mcp`
(stateless), with a health check at `GET /healthz`. Every MCP request must carry the
shared secret `MCP_AUTH_TOKEN`, either as `Authorization: Bearer <token>` or as a path
segment (`/mcp/<token>`) for clients that only accept a URL. The server refuses to start
without a token of at least 32 characters.

### Deploy to Render

1. In Render: **New → Blueprint**, pick this repository. `render.yaml` defines a Docker web service.
2. Render prompts for `ECOWITT_APPLICATION_KEY` and `ECOWITT_API_KEY`. Enter them there;
   they are stored as encrypted secrets and never committed. `MCP_AUTH_TOKEN` is generated for you.
3. After the deploy, copy `MCP_AUTH_TOKEN` from the service's **Environment** tab. Your endpoint is
   `https://<service>.onrender.com/mcp`.

The free plan sleeps after ~15 minutes idle, so the first call after a pause can take about a minute.
Choose a paid instance type if that's a problem.

### Connect a client

**Claude Code plugin** (this repo is also a plugin marketplace):

```bash
export ECOWITT_MCP_URL="https://<service>.onrender.com/mcp"
export ECOWITT_MCP_TOKEN="<MCP_AUTH_TOKEN>"
claude plugin marketplace add MichaelKade/ecowitt-mcp
claude plugin install ecowitt@ecowitt-private
```

**Claude Code, without the plugin:**

```bash
claude mcp add --transport http ecowitt https://<service>.onrender.com/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

**claude.ai / Claude Desktop custom connector:** use the URL
`https://<service>.onrender.com/mcp/<MCP_AUTH_TOKEN>` (URL-encode the token if it contains `/` or `+`).
Treat that URL like a password.

### Run locally

```bash
cp .env.example .env   # fill in keys and MCP_AUTH_TOKEN (openssl rand -hex 32)
npm run start:http
```

## Available Tools

- **get_devices** - Get all your weather stations and sensors
- **get_device_realtime_info** - Get realtime data for a specific device
- **get_device_historical_info** - Get historical data for a specific device
- **get_current_datetime** - Because AI needs a little help knowing exactly when it is.

## Available Resources

- **resources/list** - List all available Ecowitt devices
- **resources/read** - Get full details for a specific device

## Example Usage

Once configured, you can ask your AI assistant:

> "Show me all my weather devices using the get_devices tool"

> "List my Ecowitt stations"

> "What is the current temperature from my Ecowitt station?"

> "What was the weather like last Christmas?"

> "What was the wettest month this year?"

> "When should I plant garlic?"

The AI will use the MCP server to fetch your device information from the Ecowitt API.

### Contributing

Clone `.env.example` to `.env` and fill in your Ecowitt credentials:

- `ECOWITT_APPLICATION_KEY` (required) - Your Ecowitt application key
- `ECOWITT_API_KEY` (required) - Your Ecowitt API key
- `ECOWITT_BASE_URL` (optional) - Base URL for Ecowitt API (default: https://api.ecowitt.net/api/v3)
- `REQUEST_TIMEOUT` (optional) - Request timeout in milliseconds (default: 10000)
