import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ghostpanter.jingjian",
  appName: "静笺",
  webDir: "android-www",
  backgroundColor: "#F2EDE4",
  android: {
    backgroundColor: "#F2EDE4",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: "#2C4A42",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#F2EDE4",
    },
    Keyboard: {
      resize: "body",
    },
  },
};

export default config;
