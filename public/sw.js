/*
 * 代客建檔（/intake）的 service worker —— 只做一件事：收手機通知（Web Push）。
 * 不攔任何請求、不快取任何東西；註冊時 scope 限定在 /intake（src/app/intake/PushSetup.tsx）。
 * 推什麼內容由伺服器決定（src/lib/match/push-payload.ts）：{ title, body, url, tag }。
 * iPhone 的規矩：每一則 push 都一定要 showNotification，不顯示幾次之後 iOS 會把訂閱砍掉。
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "買方建檔";
  const options = {
    body: data.body || "",
    icon: "/intake-colleague-icon.png",
    badge: "/intake-colleague-icon.png",
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || "/intake" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/intake";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("/intake") && "focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
