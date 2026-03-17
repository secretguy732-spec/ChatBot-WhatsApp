// ============================================================
// firebase/firebase-config.js
// CombiChatBot-WattshApp — Firebase Configuration
// Replace the values below with your actual Firebase project.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDAObpfVGA9TN4W4xo-MeQvTFwykwRy6sY",
  authDomain: "bionapp-db8f6.firebaseapp.com",
  projectId: "bionapp-db8f6",
  storageBucket: "bionapp-db8f6.firebasestorage.app",
  messagingSenderId: "683646666202",
  appId: "1:683646666202:web:fadad0d6611d0d05ffece3",
  measurementId: "G-5R09PRXWG4"

};

// Export for use in HTML pages via CDN (window.firebaseConfig)
if (typeof window !== "undefined") {
  window.firebaseConfig = firebaseConfig;
}

// Export for Node.js backend usage
if (typeof module !== "undefined") {
  module.exports = firebaseConfig;
}
