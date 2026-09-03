import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettierConfig from "eslint-config-prettier";
import eslintPluginImport from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import eslintPluginTailwindcss from "eslint-plugin-tailwindcss";
import globals from "globals";

export default [
  // ESLint recommended rules
  js.configs.recommended,

  // Ignore build artifacts and dependencies
  {
    ignores: [
      "**/node_modules/**",
      "**/build/**",
      "**/dist/**",
      "**/.cache/**",
      "**/.claude/**",
      "**/.react-router/**",
      "**/coverage/**",
      "**/devenv/**",
      "**/e2e/**",
      "playwright.config.ts",
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
      import: eslintPluginImport,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      ...eslintPluginImport.configs.recommended.rules,
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
      // Apps consume semantic design tokens only — raw palette scales (incl.
      // grays) and the retired cytario-* brand palette are banned. Token
      // existence (incl. namespace resets) is enforced by
      // tailwindcss/no-custom-classname — but that rule only parses JSX
      // attributes and class-function calls (twMerge, clsx, …), so the
      // off-catalog radius ban below also covers bare string/template class
      // constants, which the plugin does not scan.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\brounded(?:-[a-z]+)*-(?:xs|2xl|3xl|4xl)\\b/]",
          message:
            "The design radii catalog is sm/md/lg/xl — the default radius namespace is reset, so this class silently no-ops.",
        },
        {
          selector: "TemplateElement[value.cooked=/\\brounded(?:-[a-z]+)*-(?:xs|2xl|3xl|4xl)\\b/]",
          message:
            "The design radii catalog is sm/md/lg/xl — the default radius namespace is reset, so this class silently no-ops.",
        },
        {
          selector:
            "Literal[value=/(?:text|bg|border|ring|outline|fill|stroke|from|via|to|shadow|decoration|divide|accent|caret|placeholder)-[a-z]+-(?:50|100|200|300|400|500|600|700|800|900|950)\\b/]",
          message:
            "Raw palette scales are design-system-internal — use semantic tokens (e.g. bg-destructive, bg-success, bg-warning-surface, border-warning-border).",
        },
        {
          selector:
            "TemplateElement[value.cooked=/(?:text|bg|border|ring|outline|fill|stroke|from|via|to|shadow|decoration|divide|accent|caret|placeholder)-[a-z]+-(?:50|100|200|300|400|500|600|700|800|900|950)\\b/]",
          message:
            "Raw palette scales are design-system-internal — use semantic tokens (e.g. bg-destructive, bg-success, bg-warning-surface, border-warning-border).",
        },
        {
          selector: "Literal[value=/cytario-(?:purple|turquoise)/]",
          message: "The cytario-* brand palette is retired — use design tokens.",
        },
        {
          selector: "TemplateElement[value.cooked=/cytario-(?:purple|turquoise)/]",
          message: "The cytario-* brand palette is retired — use design tokens.",
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
      import: eslintPluginImport,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...eslintPluginImport.configs.typescript.rules,
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

  // Tailwind token validity — resolved against the actual app theme
  // (app/styles.css incl. the design catalog and namespace resets), so
  // classes whose tokens don't exist (e.g. rounded-2xl after the radius
  // reset, bg-emerald-500 after the color reset) are flagged.
  {
    files: ["app/**/*.{ts,tsx}"],
    plugins: { tailwindcss: eslintPluginTailwindcss },
    settings: {
      tailwindcss: {
        cssConfigPath: "./app/styles.css",
      },
    },
    rules: {
      "tailwindcss/no-custom-classname": "error",
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
      "**/*.modal.tsx",
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

  // Disable ESLint rules that conflict with Prettier — must be last so it wins.
  // Formatting itself is enforced by `npm run format:check` (CI), not ESLint.
  prettierConfig,
];
