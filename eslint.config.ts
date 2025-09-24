import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: { globals: globals.browser },
  },
  ...tseslint.configs.recommended,
  {
    ...pluginReact.configs.flat.recommended,
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // 关闭React 17+不需要的规则
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // 允许合理使用any类型
      "@typescript-eslint/no-explicit-any": "warn",
      // 允许空对象类型
      "@typescript-eslint/no-empty-object-type": "off",
      // 允许未使用的变量（以_开头）
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // 允许空块语句
      "no-empty": "off",
      // 允许缺少display name（匿名组件）
      "react/display-name": "off",
      // 允许缺少prop-types
      "react/prop-types": "off",
      // 允许缺少key prop（某些情况下）
      "react/jsx-key": "warn",
      // 允许prefer-const警告而不是错误
      "prefer-const": "warn",
      // 允许no-fallthrough警告
      "no-fallthrough": "warn",
      // 允许no-case-declarations警告
      "no-case-declarations": "warn",
      // 允许no-prototype-builtins警告
      "no-prototype-builtins": "warn",
    },
  },
]);
