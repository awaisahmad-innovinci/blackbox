import { reactConfig } from "@blackbox/eslint-config/react";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  {
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message: "Use useConfirm() from confirm-provider instead of window.confirm.",
        },
        {
          name: "alert",
          message: "Use in-app UI instead of window.alert.",
        },
        {
          name: "prompt",
          message: "Use in-app UI instead of window.prompt.",
        },
      ],
    },
  },
];
