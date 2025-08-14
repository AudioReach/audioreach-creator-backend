import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import nodePlugin from "eslint-plugin-n";
import securityPlugin from "eslint-plugin-security";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import unicornPlugin from "eslint-plugin-unicorn";
import promisePlugin from "eslint-plugin-promise";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/*.tsbuildinfo",
      "**/coverage/**",
      "**/.yarn/**",
      "**/build/**",
      "eslint.config.js",
    ],
  },
  // Base configurations
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Plugin recommended configurations
  importPlugin.flatConfigs.recommended,
  nodePlugin.configs["flat/recommended"],
  securityPlugin.configs.recommended,
  sonarjsPlugin.configs.recommended,
  unicornPlugin.configs["recommended"],
  promisePlugin.configs["flat/recommended"],

  // Main configuration
  {
    files: ["**/*.{js,ts,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        global: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
        tsconfigRootDir: ".",
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
        },
        node: {
          extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
        },
      },
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
    },
  },

  // General rules for all js,ts files
  {
    rules: {
      "unicorn/filename-case": "off",
    },
  },

  // Test files configuration
  {
    files: ["**/*.spec.ts", "**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/cognitive-complexity": "off",
      "security/detect-object-injection": "off",
      "no-console": "off",
    },
  },

  // Configuration files
  {
    files: ["*.config.{js,ts}", "*.conf.{js,ts}"],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      "import/no-default-export": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },

  // Main entry files
  {
    files: ["**/main.ts", "**/index.ts"],
    rules: {
      "unicorn/no-process-exit": "off",
      "n/no-process-exit": "off",
    },
  },

  // Prettier integration - must be last
  prettierConfig,
];
