import type { McpTool, McpTextContent, McpToolCallResult } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { z } from 'zod';
import { Logger } from '../utils/logger.js';
import { normalizeError } from '../utils/errors.js';
import { withPreamble } from '../prompts/tool-preambles.js';

/**
 * Schema for the code generator tool arguments
 */
const CodeGeneratorArgsSchema = z.object({
  template_type: z
    .enum([
      'react-setup',
      'nextjs-setup',
      'vue-setup',
      'angular-setup',
      'nodejs-setup',
      'auth-component',
      'protected-route',
      'api-client',
      'environment-config',
      'typescript-types',
    ])
    .describe('Type of code template to generate'),
  framework: z
    .enum(['react', 'vue', 'angular', 'nextjs', 'nodejs', 'express'])
    .optional()
    .describe('Framework being used'),
  typescript: z.boolean().default(true).describe('Generate TypeScript code'),
  include_comments: z.boolean().default(true).describe('Include explanatory comments'),
  app_id: z.string().optional().describe('Frontegg App ID (will use placeholder if not provided)'),
  base_url: z
    .string()
    .optional()
    .describe('Frontegg Base URL (will use placeholder if not provided)'),
});

type CodeGeneratorArgs = z.infer<typeof CodeGeneratorArgsSchema>;

/**
 * Generated code interface
 */
interface GeneratedCode {
  file_path: string;
  file_name: string;
  content: string;
  description: string;
  dependencies?: string[];
  cursor_instructions: string[];
  next_steps: string[];
}

/**
 * MCP Tool for generating Frontegg integration boilerplate code
 */
export class FronteggCodeGenerator {
  private readonly logger = Logger.getInstance();
  private readonly toolName = 'frontegg_generate_code';

  public readonly toolDefinition: McpTool = {
    name: this.toolName,
    description: withPreamble(
      'frontegg_generate_code',
      'Generate boilerplate code for Frontegg integration. Creates complete, ready-to-use code files that Cursor can directly implement in your project.'
    ),
    inputSchema: {
      type: 'object',
      properties: {
        template_type: {
          type: 'string',
          description: 'Type of code template to generate',
          enum: [
            'react-setup',
            'nextjs-setup',
            'vue-setup',
            'angular-setup',
            'nodejs-setup',
            'auth-component',
            'protected-route',
            'api-client',
            'environment-config',
            'typescript-types',
          ],
        },
        framework: {
          type: 'string',
          description: 'Framework being used',
          enum: ['react', 'vue', 'angular', 'nextjs', 'nodejs', 'express'],
        },
        typescript: {
          type: 'boolean',
          description: 'Generate TypeScript code',
          default: true,
        },
        include_comments: {
          type: 'boolean',
          description: 'Include explanatory comments',
          default: true,
        },
        app_id: {
          type: 'string',
          description: 'Frontegg App ID (will use placeholder if not provided)',
        },
        base_url: {
          type: 'string',
          description: 'Frontegg Base URL (will use placeholder if not provided)',
        },
      },
      required: ['template_type'],
    },
  };

  public register(registry: ToolRegistry): void {
    this.logger.info('Registering Frontegg code generator tool');
    registry.add(this.toolDefinition, (rawArgs) => this.handle(rawArgs));
  }

  private async handle(rawArgs: unknown): Promise<McpToolCallResult> {
    try {
      const args = await this.validateArguments(rawArgs);
      const result = await this.generateCode(args);
      return { content: [result] };
    } catch (error) {
      this.logger.error('Code generator execution failed', { error });
      const normalizedError = normalizeError(error);
      throw new Error(`Code generator failed: ${normalizedError.message}`);
    }
  }

  private async validateArguments(args: unknown): Promise<CodeGeneratorArgs> {
    return CodeGeneratorArgsSchema.parse(args);
  }

  private async generateCode(args: CodeGeneratorArgs): Promise<McpTextContent> {
    this.logger.info('Generating Frontegg code', {
      template: args.template_type,
      framework: args.framework,
      typescript: args.typescript,
    });

    const generatedCode = await this.createCodeTemplate(args);
    const formatted = this.formatCodeForCursor(generatedCode);

    return {
      type: 'text',
      text: formatted,
    };
  }

  private async createCodeTemplate(args: CodeGeneratorArgs): Promise<GeneratedCode> {
    const { template_type, framework, typescript, include_comments, app_id, base_url } = args;

    const placeholderAppId = app_id || 'your-frontegg-app-id-here';
    const placeholderBaseUrl = base_url || 'https://app-your-subdomain.frontegg.com';

    switch (template_type) {
      case 'react-setup':
        return this.generateReactSetup(
          typescript,
          include_comments,
          placeholderAppId,
          placeholderBaseUrl
        );

      case 'nextjs-setup':
        return this.generateNextJSSetup(
          typescript,
          include_comments,
          placeholderAppId,
          placeholderBaseUrl
        );

      case 'vue-setup':
        return this.generateVueSetup(
          typescript,
          include_comments,
          placeholderAppId,
          placeholderBaseUrl
        );

      case 'auth-component':
        return this.generateAuthComponent(framework || 'react', typescript, include_comments);

      case 'protected-route':
        return this.generateProtectedRoute(framework || 'react', typescript, include_comments);

      case 'api-client':
        return this.generateApiClient(typescript, include_comments, placeholderBaseUrl);

      case 'environment-config':
        return this.generateEnvironmentConfig(placeholderAppId, placeholderBaseUrl);

      case 'typescript-types':
        return this.generateTypeScriptTypes();

      default:
        throw new Error(`Unsupported template type: ${template_type}`);
    }
  }

  private generateReactSetup(
    typescript: boolean,
    includeComments: boolean,
    appId: string,
    baseUrl: string
  ): GeneratedCode {
    const ext = typescript ? 'tsx' : 'jsx';
    const comments = includeComments
      ? `
${typescript ? '// ' : '// '}Frontegg React Setup
${typescript ? '// ' : '// '}This file sets up the Frontegg provider for your React application
`
      : '';

    const content = `${comments}import React from 'react';
import { FronteggProvider } from '@frontegg/react';

${includeComments ? '// Frontegg configuration' : ''}
const fronteggConfig = {
  contextOptions: {
    baseUrl: '${baseUrl}',
    clientId: '${appId}',
  },
  ${includeComments ? '// Optional: Customize the hosted login experience' : ''}
  hostedLoginBox: true,
  ${includeComments ? '// Optional: Enable additional features' : ''}
  authOptions: {
    keepSessionAlive: true,
  },
};

${typescript ? 'interface AppProps {}' : ''}

const App${typescript ? ': React.FC<AppProps>' : ''} = () => {
  return (
    <FronteggProvider 
      contextOptions={fronteggConfig.contextOptions}
      hostedLoginBox={fronteggConfig.hostedLoginBox}
      authOptions={fronteggConfig.authOptions}
    >
      <div className="App">
        {${includeComments ? '/* Your app components go here */' : ''}}
        <h1>Welcome to your Frontegg-enabled app!</h1>
      </div>
    </FronteggProvider>
  );
};

export default App;`;

    return {
      file_path: `src/App.${ext}`,
      file_name: `App.${ext}`,
      content,
      description: 'React application setup with Frontegg provider',
      dependencies: ['@frontegg/react'],
      cursor_instructions: [
        '📁 **Create/Replace** src/App.tsx with this content',
        '🔑 **Update** the contextOptions with your actual Frontegg credentials',
        '💾 **Save** the file',
        '🔄 **Restart** your development server',
      ],
      next_steps: [
        'Install dependencies: npm install @frontegg/react',
        'Update environment variables with your Frontegg credentials',
        'Test the login functionality',
        'Customize the UI as needed',
      ],
    };
  }

  private generateNextJSSetup(
    typescript: boolean,
    includeComments: boolean,
    appId: string,
    baseUrl: string
  ): GeneratedCode {
    const ext = typescript ? 'tsx' : 'jsx';
    const comments = includeComments
      ? `
${typescript ? '// ' : '// '}Next.js Frontegg Setup
${typescript ? '// ' : '// '}This file configures Frontegg for your Next.js application
`
      : '';

    const content = `${comments}import type { AppProps } from 'next/app';
import { FronteggProvider } from '@frontegg/nextjs';
import { useRouter } from 'next/router';

${includeComments ? '// Frontegg configuration for Next.js' : ''}
const fronteggConfig = {
  contextOptions: {
    baseUrl: '${baseUrl}',
    clientId: '${appId}',
  },
  ${includeComments ? '// Next.js specific options' : ''}
  authOptions: {
    keepSessionAlive: true,
  },
};

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  return (
    <FronteggProvider 
      contextOptions={fronteggConfig.contextOptions}
      hostedLoginBox={true}
      router={router}
      authOptions={fronteggConfig.authOptions}
    >
      <Component {...pageProps} />
    </FronteggProvider>
  );
}

export default MyApp;`;

    return {
      file_path: `pages/_app.${ext}`,
      file_name: `_app.${ext}`,
      content,
      description: 'Next.js application setup with Frontegg provider',
      dependencies: ['@frontegg/nextjs'],
      cursor_instructions: [
        '📁 **Create/Replace** pages/_app.tsx with this content',
        '🔑 **Update** the contextOptions with your actual Frontegg credentials',
        '💾 **Save** the file',
        '🔄 **Restart** your Next.js development server',
      ],
      next_steps: [
        'Install dependencies: npm install @frontegg/nextjs',
        'Update environment variables',
        'Create protected pages using the withFronteggApp HOC',
        'Test authentication flow',
      ],
    };
  }

  private generateVueSetup(
    typescript: boolean,
    includeComments: boolean,
    appId: string,
    baseUrl: string
  ): GeneratedCode {
    const ext = typescript ? 'ts' : 'js';
    const comments = includeComments
      ? `
${typescript ? '// ' : '// '}Vue.js Frontegg Setup
${typescript ? '// ' : '// '}This file configures Frontegg for your Vue.js application
`
      : '';

    const content = `${comments}import { createApp } from 'vue';
import App from './App.vue';
import { Frontegg } from '@frontegg/vue';

${includeComments ? '// Frontegg configuration for Vue.js' : ''}
const fronteggConfig = {
  contextOptions: {
    baseUrl: '${baseUrl}',
    clientId: '${appId}',
  },
  ${includeComments ? '// Vue.js specific options' : ''}
  authOptions: {
    keepSessionAlive: true,
  },
};

const app = createApp(App);

${includeComments ? '// Install Frontegg plugin' : ''}
app.use(Frontegg, fronteggConfig);

app.mount('#app');`;

    return {
      file_path: `src/main.${ext}`,
      file_name: `main.${ext}`,
      content,
      description: 'Vue.js application setup with Frontegg',
      dependencies: ['@frontegg/vue'],
      cursor_instructions: [
        '📁 **Create/Replace** src/main.ts with this content',
        '🔑 **Update** the contextOptions with your actual Frontegg credentials',
        '💾 **Save** the file',
        '🔄 **Restart** your Vue development server',
      ],
      next_steps: [
        'Install dependencies: npm install @frontegg/vue',
        'Update environment variables',
        'Use Frontegg composables in your components',
        'Test authentication flow',
      ],
    };
  }

  private generateAuthComponent(
    framework: string,
    typescript: boolean,
    includeComments: boolean
  ): GeneratedCode {
    const ext = typescript ? 'tsx' : 'jsx';
    const comments = includeComments
      ? `
${typescript ? '// ' : '// '}Authentication Component
${typescript ? '// ' : '// '}This component handles user authentication state and login/logout
`
      : '';

    let content = '';
    let dependencies: string[] = [];
    let fileName = '';

    switch (framework) {
      case 'react':
      case 'nextjs':
        fileName = `AuthComponent.${ext}`;
        dependencies = ['@frontegg/react'];
        content = `${comments}import React from 'react';
import { useAuth, useLoginWithRedirect, ContextHolder } from '@frontegg/react';

${typescript ? 'interface AuthComponentProps {}' : ''}

const AuthComponent${typescript ? ': React.FC<AuthComponentProps>' : ''} = () => {
  const { user, isAuthenticated } = useAuth();
  const loginWithRedirect = useLoginWithRedirect();

  ${includeComments ? '// Handle logout' : ''}
  const logout = () => {
    const baseUrl = ContextHolder.getContext().baseUrl;
    window.location.href = \`\${baseUrl}/oauth/logout?post_logout_redirect_uri=\${window.location.origin}\`;
  };

  if (isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="user-info">
          <h2>Welcome, {user?.name || user?.email}!</h2>
          <p>Email: {user?.email}</p>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h2>Please log in</h2>
      <button onClick={() => loginWithRedirect()} className="login-btn">
        Login
      </button>
    </div>
  );
};

export default AuthComponent;`;
        break;

      case 'vue':
        fileName = `AuthComponent.vue`;
        dependencies = ['@frontegg/vue'];
        content = `<template>
  <div class="auth-container">
    <div v-if="isAuthenticated" class="user-info">
      <h2>Welcome, {{ user?.name || user?.email }}!</h2>
      <p>Email: {{ user?.email }}</p>
      <button @click="logout" class="logout-btn">
        Logout
      </button>
    </div>
    <div v-else>
      <h2>Please log in</h2>
      <button @click="login" class="login-btn">
        Login
      </button>
    </div>
  </div>
</template>

<script${typescript ? ' lang="ts"' : ''}>
import { useFrontegg } from '@frontegg/vue';

export default {
  name: 'AuthComponent',
  setup() {
    const { user, isAuthenticated, loginWithRedirect } = useFrontegg();

    const login = () => {
      loginWithRedirect();
    };

    const logout = () => {
      ${includeComments ? '// Implement logout logic' : ''}
      window.location.href = '/logout';
    };

    return {
      user,
      isAuthenticated,
      login,
      logout,
    };
  },
};
</script>

<style scoped>
.auth-container {
  padding: 20px;
  text-align: center;
}

.login-btn, .logout-btn {
  padding: 10px 20px;
  margin: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.login-btn {
  background-color: #007bff;
  color: white;
}

.logout-btn {
  background-color: #dc3545;
  color: white;
}
</style>`;
        break;
    }

    return {
      file_path: `src/components/${fileName}`,
      file_name: fileName,
      content,
      description: `${framework} authentication component with login/logout functionality`,
      dependencies,
      cursor_instructions: [
        `📁 **Create** src/components/${fileName}`,
        '📝 **Copy** the generated code into the file',
        '💾 **Save** the file',
        '🎨 **Customize** styling as needed',
        '🔗 **Import** and use in your main component',
      ],
      next_steps: [
        'Style the component to match your design',
        'Add error handling for authentication failures',
        'Implement loading states',
        'Add role-based access control if needed',
      ],
    };
  }

  private generateProtectedRoute(
    framework: string,
    typescript: boolean,
    includeComments: boolean
  ): GeneratedCode {
    const ext = typescript ? 'tsx' : 'jsx';
    const comments = includeComments
      ? `
${typescript ? '// ' : '// '}Protected Route Component
${typescript ? '// ' : '// '}This component protects routes and redirects unauthenticated users
`
      : '';

    let content = '';
    let dependencies: string[] = [];

    switch (framework) {
      case 'react':
        dependencies = ['@frontegg/react'];
        content = `${comments}import React${typescript ? ', { ReactNode }' : ''} from 'react';
import { useAuth, useLoginWithRedirect } from '@frontegg/react';

${
  typescript
    ? `interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
}`
    : ''
}

const ProtectedRoute${typescript ? ': React.FC<ProtectedRouteProps>' : ''} = ({ 
  children, 
  fallback 
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const loginWithRedirect = useLoginWithRedirect();

  ${includeComments ? '// Show loading while checking authentication' : ''}
  if (isLoading) {
    return (
      <div className="loading-container">
        <p>Loading...</p>
      </div>
    );
  }

  ${includeComments ? '// Redirect to login if not authenticated' : ''}
  if (!isAuthenticated) {
    return (
      fallback || (
        <div className="auth-required">
          <h2>Authentication Required</h2>
          <p>You need to be logged in to access this page.</p>
          <button onClick={() => loginWithRedirect()}>
            Login
          </button>
        </div>
      )
    );
  }

  ${includeComments ? '// Render children if authenticated' : ''}
  return <>{children}</>;
};

export default ProtectedRoute;`;
        break;

      case 'nextjs':
        dependencies = ['@frontegg/nextjs'];
        content = `${comments}import React${typescript ? ', { ReactNode }' : ''} from 'react';
import { useAuth, useRouter } from '@frontegg/nextjs';
import { useEffect } from 'react';

${
  typescript
    ? `interface ProtectedRouteProps {
  children: ReactNode;
}`
    : ''
}

const ProtectedRoute${typescript ? ': React.FC<ProtectedRouteProps>' : ''} = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      ${includeComments ? '// Redirect to login page' : ''}
      router.push('/account/login');
    }
  }, [isAuthenticated, isLoading, router]);

  ${includeComments ? '// Show loading while checking authentication' : ''}
  if (isLoading) {
    return (
      <div className="loading-container">
        <p>Loading...</p>
      </div>
    );
  }

  ${includeComments ? "// Don't render anything if not authenticated (will redirect)" : ''}
  if (!isAuthenticated) {
    return null;
  }

  ${includeComments ? '// Render children if authenticated' : ''}
  return <>{children}</>;
};

export default ProtectedRoute;`;
        break;
    }

    return {
      file_path: `src/components/ProtectedRoute.${ext}`,
      file_name: `ProtectedRoute.${ext}`,
      content,
      description: `${framework} protected route component for authentication`,
      dependencies,
      cursor_instructions: [
        `📁 **Create** src/components/ProtectedRoute.${ext}`,
        '📝 **Copy** the generated code into the file',
        '💾 **Save** the file',
        '🔗 **Wrap** protected components with this component',
        '🧪 **Test** authentication flow',
      ],
      next_steps: [
        'Wrap sensitive components with ProtectedRoute',
        'Customize the fallback UI',
        'Add role-based protection if needed',
        'Test with different authentication states',
      ],
    };
  }

  private generateApiClient(
    typescript: boolean,
    includeComments: boolean,
    baseUrl: string
  ): GeneratedCode {
    const ext = typescript ? 'ts' : 'js';
    const comments = includeComments
      ? `
${typescript ? '// ' : '// '}Frontegg API Client
${typescript ? '// ' : '// '}This file provides an authenticated HTTP client for Frontegg API calls
`
      : '';

    const content = `${comments}import axios${typescript ? ', { AxiosInstance, AxiosResponse }' : ''} from 'axios';
import { ContextHolder } from '@frontegg/react';

${
  typescript
    ? `
// API response types
interface ApiResponse<T = any> {
  data: T;
  success: boolean;
  message?: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  profilePictureUrl?: string;
}
`
    : ''
}

class FronteggApiClient {
  private client${typescript ? ': AxiosInstance' : ''};

  constructor() {
    this.client = axios.create({
      baseURL: '${baseUrl}',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    ${includeComments ? '// Add request interceptor to include auth token' : ''}
    this.client.interceptors.request.use(
      (config) => {
        const accessToken = ContextHolder.getAccessToken();
        if (accessToken) {
          config.headers.Authorization = \`Bearer \${accessToken}\`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    ${includeComments ? '// Add response interceptor for error handling' : ''}
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          ${includeComments ? '// Handle unauthorized - could trigger re-login' : ''}
          console.warn('Unauthorized request - token may be expired');
        }
        return Promise.reject(error);
      }
    );
  }

  ${includeComments ? '// Get current user profile' : ''}
  async getUserProfile()${typescript ? ': Promise<UserProfile>' : ''} {
    try {
      const response${typescript ? ': AxiosResponse<UserProfile>' : ''} = await this.client.get('/identity/resources/users/v1/me');
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      throw error;
    }
  }

  ${includeComments ? '// Update user profile' : ''}
  async updateUserProfile(data${typescript ? ': Partial<UserProfile>' : ''})${typescript ? ': Promise<UserProfile>' : ''} {
    try {
      const response${typescript ? ': AxiosResponse<UserProfile>' : ''} = await this.client.patch('/identity/resources/users/v1/me', data);
      return response.data;
    } catch (error) {
      console.error('Failed to update user profile:', error);
      throw error;
    }
  }

  ${includeComments ? '// Generic API call method' : ''}
  async apiCall${typescript ? '<T = any>' : ''}(
    method${typescript ? ': string' : ''}, 
    endpoint${typescript ? ': string' : ''}, 
    data${typescript ? '?: any' : ''} = null
  )${typescript ? ': Promise<T>' : ''} {
    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        data,
      });
      return response.data;
    } catch (error) {
      console.error(\`API call failed: \${method} \${endpoint}\`, error);
      throw error;
    }
  }
}

${includeComments ? '// Export singleton instance' : ''}
export const apiClient = new FronteggApiClient();
export default apiClient;`;

    return {
      file_path: `src/services/fronteggApi.${ext}`,
      file_name: `fronteggApi.${ext}`,
      content,
      description: 'Authenticated API client for Frontegg backend calls',
      dependencies: ['axios', '@frontegg/react'],
      cursor_instructions: [
        "📁 **Create** src/services/ directory if it doesn't exist",
        `📝 **Create** fronteggApi.${ext} with the generated code`,
        '💾 **Save** the file',
        '📦 **Install** axios if not already installed: `npm install axios`',
        '🔗 **Import** and use in your components',
      ],
      next_steps: [
        'Add more API methods as needed',
        'Implement proper error handling in your components',
        'Add request/response logging for debugging',
        'Consider adding request caching for performance',
      ],
    };
  }

  private generateEnvironmentConfig(appId: string, baseUrl: string): GeneratedCode {
    const content = `# Frontegg Configuration
# Replace these values with your actual Frontegg credentials

# Required: Your Frontegg App ID
FRONTEGG_APP_ID=${appId}

# Required: Your Frontegg Base URL
FRONTEGG_BASE_URL=${baseUrl}

# Optional: Client ID (for some integrations)
FRONTEGG_CLIENT_ID=your-client-id-here

# Optional: API Key (for server-side operations)
FRONTEGG_API_KEY=your-api-key-here

# Development/Production Environment
NODE_ENV=development

# Optional: Enable debug logging
DEBUG=frontegg:*

# Optional: Custom redirect URLs
FRONTEGG_LOGIN_REDIRECT_URL=http://localhost:3000/dashboard
FRONTEGG_LOGOUT_REDIRECT_URL=http://localhost:3000/`;

    return {
      file_path: '.env',
      file_name: '.env',
      content,
      description: 'Environment configuration file for Frontegg',
      cursor_instructions: [
        '📁 **Create** .env file in your project root',
        '📝 **Copy** the generated content',
        '🔑 **Replace** placeholder values with your actual Frontegg credentials',
        '💾 **Save** the file',
        '🔒 **Add** .env to .gitignore to keep credentials secure',
      ],
      next_steps: [
        'Get your actual App ID and Base URL from Frontegg dashboard',
        'Ensure .env is in your .gitignore file',
        'Restart your development server to load new environment variables',
        'Verify environment variables are loaded correctly',
      ],
    };
  }

  private generateTypeScriptTypes(): GeneratedCode {
    const content = `// Frontegg TypeScript Type Definitions
// This file provides type safety for Frontegg integration

// User-related types
export interface FronteggUser {
  id: string;
  email: string;
  name?: string;
  profilePictureUrl?: string;
  verified: boolean;
  metadata?: Record<string, any>;
  roles?: FronteggRole[];
  permissions?: FronteggPermission[];
  tenantId?: string;
  tenantIds?: string[];
}

// Role and Permission types
export interface FronteggRole {
  id: string;
  name: string;
  description?: string;
  permissions?: FronteggPermission[];
}

export interface FronteggPermission {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
}

// Authentication context types
export interface FronteggAuthState {
  user: FronteggUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  refreshToken: string | null;
}

// Configuration types
export interface FronteggContextOptions {
  baseUrl: string;
  clientId: string;
  appId?: string;
}

export interface FronteggAuthOptions {
  keepSessionAlive?: boolean;
  sessionTokenKey?: string;
  refreshTokenKey?: string;
}

// API response types
export interface FronteggApiResponse<T = any> {
  data: T;
  success: boolean;
  message?: string;
  errors?: string[];
}

// Tenant types (for multi-tenant applications)
export interface FronteggTenant {
  id: string;
  name: string;
  website?: string;
  metadata?: Record<string, any>;
}

// Hook return types
export interface UseFronteggReturn {
  user: FronteggUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  getAccessToken: () => Promise<string | null>;
  loginWithRedirect: () => void;
  logout: () => void;
}

// Event types
export type FronteggEventType = 
  | 'frontegg-user-loaded'
  | 'frontegg-user-signed-in'
  | 'frontegg-user-signed-out'
  | 'frontegg-session-expired';

export interface FronteggEvent {
  type: FronteggEventType;
  payload?: any;
}

// Utility types
export type FronteggUserRoles = string[];
export type FronteggUserPermissions = string[];

// Component prop types
export interface FronteggProviderProps {
  contextOptions: FronteggContextOptions;
  authOptions?: FronteggAuthOptions;
  hostedLoginBox?: boolean;
  children: React.ReactNode;
}

// Environment variables (for process.env typing)
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FRONTEGG_APP_ID: string;
      FRONTEGG_BASE_URL: string;
      FRONTEGG_CLIENT_ID?: string;
      FRONTEGG_API_KEY?: string;
    }
  }
}

export {};`;

    return {
      file_path: 'src/types/frontegg.d.ts',
      file_name: 'frontegg.d.ts',
      content,
      description: 'TypeScript type definitions for Frontegg integration',
      cursor_instructions: [
        "📁 **Create** src/types/ directory if it doesn't exist",
        '📝 **Create** frontegg.d.ts with the generated types',
        '💾 **Save** the file',
        '🔧 **Update** tsconfig.json to include the types directory if needed',
        '🔗 **Import** types in your components for better type safety',
      ],
      next_steps: [
        'Import and use these types in your components',
        'Extend types as needed for your specific use case',
        'Add JSDoc comments for better IDE support',
        'Consider creating more specific types for your domain',
      ],
    };
  }

  private formatCodeForCursor(generatedCode: GeneratedCode): string {
    const lines: string[] = [];

    lines.push(`# 🎯 Generated Frontegg Code`);
    lines.push(`**File**: \`${generatedCode.file_path}\``);
    lines.push(`**Description**: ${generatedCode.description}`);
    lines.push('');

    if (generatedCode.dependencies && generatedCode.dependencies.length > 0) {
      lines.push(`## 📦 Required Dependencies`);
      lines.push('```bash');
      lines.push(`npm install ${generatedCode.dependencies.join(' ')}`);
      lines.push('```');
      lines.push('');
    }

    lines.push(`## 💻 Generated Code`);
    lines.push(`**File: \`${generatedCode.file_name}\`**`);
    lines.push('```typescript');
    lines.push(generatedCode.content);
    lines.push('```');
    lines.push('');

    lines.push(`## 🎯 Cursor Implementation Steps`);
    generatedCode.cursor_instructions.forEach((instruction, index) => {
      lines.push(`${index + 1}. ${instruction}`);
    });
    lines.push('');

    lines.push(`## 🚀 Next Steps`);
    generatedCode.next_steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    lines.push('');

    lines.push(`---`);
    lines.push(`🤖 **Generated by**: Frontegg Code Generator`);
    lines.push(`📁 **Ready for**: Direct implementation in Cursor`);

    return lines.join('\n');
  }
}
