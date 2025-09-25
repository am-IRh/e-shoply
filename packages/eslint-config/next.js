import { defineConfig } from "@fullstacksjs/eslint-config"

export default defineConfig({
  prettier: true,
  gitignore: false,
  rules: {
    "@typescript-eslint/triple-slash-reference": "off",
  },
})
