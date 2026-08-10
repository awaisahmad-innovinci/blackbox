import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("blackbox", {
  platform: process.platform,
});
