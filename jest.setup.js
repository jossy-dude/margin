// Gesture Handler 3 throws when a GestureDetector renders outside GestureHandlerRootView. The app has one
// (src/App.tsx); tests render components on their own, so stand in for it by making the root context truthy.
// Both builds are mocked because jest can reach either one (`main` is lib/module, `react-native` is src).
jest.mock('react-native-gesture-handler/lib/module/GestureHandlerRootViewContext', () => ({ __esModule: true, default: require('react').createContext(true) }));
jest.mock('react-native-gesture-handler/src/GestureHandlerRootViewContext', () => ({ __esModule: true, default: require('react').createContext(true) }));
