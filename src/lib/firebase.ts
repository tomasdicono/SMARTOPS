import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyDpjFwp9YNOtQvFbTHYioUSSwmLQ03a1Ik",
    authDomain: "smartops-c22de.firebaseapp.com",
    databaseURL: "https://smartops-c22de-default-rtdb.firebaseio.com",
    projectId: "smartops-c22de",
    storageBucket: "smartops-c22de.firebasestorage.app",
    messagingSenderId: "823379296889",
    appId: "1:823379296889:web:10342091c7a60069f58aa8",
    measurementId: "G-7C59YMNW2Y"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
