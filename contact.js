import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAWenBcaaXd00FiDnyyjwf3FWFVGWYH_HI",
  authDomain: "zasekiapp-648b7.firebaseapp.com",
  projectId: "zasekiapp-648b7",
  storageBucket: "zasekiapp-648b7.firebasestorage.app",
  messagingSenderId: "182370319145",
  appId: "1:182370319145:web:53afb7d1ba5360bb275538",
  measurementId: "G-5QCY60B9B0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

let currentUser = null;

function showStatus(message, type = "success") {
  const status = $("contactStatus");
  status.className = `contact-status ${type}`;
  status.textContent = message;
}

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Firefox")) return "Firefox";
  return "その他";
}

function detectDevice() {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "その他";
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user && $("contactEmail")) {
    $("contactEmail").value = user.email || "";
    if (!$("contactName").value && user.displayName) {
      $("contactName").value = user.displayName;
    }
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const browser = detectBrowser();
  const device = detectDevice();

  if ($("contactBrowser")) $("contactBrowser").value = browser;
  if ($("contactDevice")) $("contactDevice").value = device;

  $("contactForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = $("contactSubmitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "送信中...";

    try {
      const data = {
        name: $("contactName").value.trim(),
        email: $("contactEmail").value.trim(),
        type: $("contactType").value,
        subject: $("contactSubject").value.trim(),
        message: $("contactMessage").value.trim(),
        device: $("contactDevice").value,
        browser: $("contactBrowser").value,
        version: $("contactVersion").value.trim(),
        pageUrl: location.href,
        userAgent: navigator.userAgent,
        uid: currentUser ? currentUser.uid : null,
        userEmail: currentUser ? currentUser.email : null,
        status: "未対応",
        createdAt: serverTimestamp()
      };

      if (!data.name || !data.email || !data.type || !data.subject || !data.message) {
        throw new Error("必須項目が入力されていません。");
      }

      if (!$("privacyAgree").checked) {
        throw new Error("プライバシーポリシーへの同意が必要です。");
      }

      await addDoc(collection(db, "contacts"), data);

      $("contactForm").reset();
      $("contactVersion").value = "LaClass 8.0";
      $("contactBrowser").value = detectBrowser();
      $("contactDevice").value = detectDevice();

      showStatus("お問い合わせを送信しました。内容を確認後、順次対応いたします。", "success");
    } catch (error) {
      console.error(error);
      showStatus("送信に失敗しました。時間をおいて再度お試しください。FirebaseのRules設定も確認してください。", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "送信する";
    }
  });
});
