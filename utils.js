// Глобальный объект радара
let onlineUsers = {};

// 1. Функция для уведомлений в стиле NFS
function nfsNotify(title, icon = 'success') {
  if (typeof Swal === 'undefined') return;
  Swal.fire({
    title: title.toUpperCase(), icon: icon, toast: true, position: 'top-end',
    showConfirmButton: false, timer: 3000, background: '#0a0a0a',
    color: '#f1c40f', iconColor: '#f1c40f', customClass: { popup: 'nfs-toast-border' }
  });
}

// 2. Функция обновления счетчика сообщений
async function updateGlobalMsgBadge(supabase, myId) {
  if (!supabase || !myId) return;
  const { count, error } = await supabase
    .from('direct_messages').select('*', { count: 'exact', head: true })
    .eq('receiver_id', myId).eq('is_read', false);

  const badge = document.getElementById('msgBadge');
  if (badge) {
    if (!error && count > 0) {
      badge.innerText = `(${count})`;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

// 3. ГЛОБАЛЬНЫЙ ТРЕКЕР СТАТУСА
async function initGlobalStatus(supabase, profile) {
  if (!supabase || !profile) return;
  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  const statusChannel = supabase.channel('global-online', {
    config: { presence: { key: profile.username } }
  });

  statusChannel
    .on('presence', { event: 'sync' }, () => {
      onlineUsers = statusChannel.presenceState();

      // Авто-обновление элементов на разных страницах
      if (typeof loadRecentDMs === 'function') loadRecentDMs();
      if (typeof loadSidebarFriends === 'function') loadSidebarFriends();
      if (typeof updateLiveStatusUI === 'function') updateLiveStatusUI();

      const fOnline = document.getElementById('footerOnline');
      const fPlaying = document.getElementById('footerPlaying');
      if (fOnline) {
        let total = 0, playing = 0;
        for (const key in onlineUsers) {
          total++;
          const s = onlineUsers[key][0].status;
          if (s === 'IN GAME' || s === 'LOOKING FOR GAME') playing++;
        }
        fOnline.innerText = total;
        if (fPlaying) fPlaying.innerText = playing;
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await supabase.from('profiles').update({ status: 'ONLINE' }).eq('id', profile.id);
        await statusChannel.track({
          user: profile.username,
          location: currentPage,
          status: profile.status || 'ONLINE'
        });
      }
    });

  window.addEventListener('beforeunload', () => {
    supabase.from('profiles').update({ status: 'OFFLINE' }).eq('id', profile.id);
  });
}
