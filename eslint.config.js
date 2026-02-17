import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  // ESLint recommended rules
  js.configs.recommended,

  // Ignore build artifacts and dependencies
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/.cache/**",
      "**/.react-router/**",
      "**/coverage/**",
      "**/devenv/**",
    ],
  },

  // JavaScript/TypeScript + React configuration
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        React: "readonly",
        JSX: "readonly",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "jsx-a11y": jsxA11yPlugin,
      import: importPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      ...importPlugin.configs.recommended.rules,
      // Enforce organized imports: external, then internal, alphabetically
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            ["internal", "parent", "sibling", "index"],
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
      // Treat these components like forms/links for a11y rules
      formComponents: ["Form"],
      linkComponents: [
        { name: "Link", linkAttribute: "to" },
        { name: "NavLink", linkAttribute: "to" },
      ],
      "import/resolver": {
        typescript: {},
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx"],
        },
      },
    },
  },

  // TypeScript-specific configuration
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      // Fetch API types
      globals: {
        RequestInit: "readonly",
        RequestInfo: "readonly",
        HeadersInit: "readonly",
        BodyInit: "readonly",
        Response: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
    },
    settings: {
      // Treat imports starting with ~/ as internal
      "import/internal-regex": "^~/",
      "import/resolver": {
        node: {
          extensions: [".ts", ".tsx"],
        },
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },

  // Test files configuration
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/vitest.setup.ts",
      "**/__mocks__/**",
      "**/__mocks__.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        // Vitest globals
        vi: true,
        describe: true,
        test: true,
        expect: true,
        beforeEach: true,
        afterEach: true,
        beforeAll: true,
        afterAll: true,
      },
    },
    rules: {
      // Allow ts-expect-error in tests for intentional error cases
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": false,
          "ts-ignore": false,
        },
      ],
      // Enforce consistent test function naming
      "no-restricted-globals": [
        "warn",
        {
          name: "it",
          message: 'Use "test" instead of "it".',
        },
      ],
    },
  },

  // Enforce named exports in app directory (except routes and framework files)
  {
    files: ["app/**/*.{ts,tsx,js,jsx}"],
    ignores: [
      "app/routes/**",
      "app/routes.ts",
      "app/root.tsx",
      "app/entry.*.tsx",
      "**/__mocks__.*",
    ],
    rules: {
      "import/no-default-export": "error",
    },
  },

  // Configuration files
  {
    files: [".eslintrc.cjs", "eslint.config.js", "vitest.config.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
