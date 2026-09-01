self.addEventListener('install',event=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(_){data={body:event.data?event.data.text():''}}
  const title=data.title||'RostaTravel';
  const options={body:data.body||'Nuovo avviso sul tuo treno.',tag:data.tag||'rosta-alert',icon:'/icon.svg',badge:'/icon.svg',data:{url:data.url||'/'}};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification.data?.url||'/';
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const c of clients){if('focus'in c){c.navigate(url);return c.focus()}}
    if(self.clients.openWindow)return self.clients.openWindow(url);
  }));
});
