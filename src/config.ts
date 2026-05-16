import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-skill-swap",
  description: "Match complementary teach/learn tags with people in the room via QR",
  accentHex: "#8b5cf6",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});
