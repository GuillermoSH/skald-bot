import type { ServerAdapter } from "./types.js";

/** El lanzador que deja itzg/minecraft-server: fabric-server-mc.26.2-loader.0.20.1-launcher.1.1.2.jar */
const FABRIC_JAR_RE = /^fabric-server-(?:mc\.[^-]+-)?loader\.([0-9][\w.+]*)-launcher\.[\w.]+\.jar$|^fabric-server-launch\.jar$/;

export const fabricAdapter: ServerAdapter = {
  id: "fabric",
  displayName: "Fabric",
  detect: ({ dataFiles = [] }) => dataFiles.some((f) => FABRIC_JAR_RE.test(f) || f === ".fabric"),
  describe: ({ dataFiles = [] }) => {
    for (const f of dataFiles) {
      const version = FABRIC_JAR_RE.exec(f)?.[1];
      if (version) return `Fabric ${version}`;
    }
    return "Fabric";
  },
};
