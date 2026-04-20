// Глобальный объект радара (доступен на всех страницах, где подключен utils.js)
let onlineUsers = {};

/**
 * 1. Функция для уведомлений в стиле NFS
 * Использует SweetAlert2 для красивых всплывашек
 */
function nfsNotify(title, icon = 'success') {
  if (typeof Swal === 'undefined') return;
  Swal.fire({
    title: title.toUpperCase(),
    icon: icon,
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    background: '#0a0a0a',
    color: '#f1c40f',
    iconColor: '#f1c40f',
    customClass: {
      popup: 'nfs-toast-border'
    }
  });
}

/**
 * 2. Функция обновления счетчика сообщений
 */
async function updateGlobalMsgBadge(supabase, myId) {
  if (!supabase || !myId) return;

  const { count, error } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', myId)
    .eq('is_read', false);

  const badge = document.getElementById('msgBadge');
  if (badge) {
    if (!error && count > 0) {
      badge.innerText = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * 3. ГЛОБАЛЬНЫЙ ТРЕКЕР СТАТУСА (МАЯК)
 */
async function initGlobalStatus(supabase, profile) {
  if (!supabase || !profile) return;

  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  const statusChannel = supabase.channel('global-online', {
    config: { presence: { key: profile.username } }
  });

  statusChannel
    .on('presence', { event: 'sync' }, () => {
      onlineUsers = statusChannel.presenceState();

      // 1. Счетчик в футере
      const footerOnline = document.getElementById('footerOnline');
      if (footerOnline) {
        footerOnline.innerText = Object.keys(onlineUsers).length;
      }

      // 2. Красные точки в сайдбаре (Главная)
      if (typeof window.updateFriendsStatusOnly === 'function') {
        window.updateFriendsStatusOnly();
      }

      // 3. Точки в списке чатов (Мессенджер)
      if (typeof window.loadRecentDMs === 'function') {
        window.loadRecentDMs();
      }

      // 4. Статус в профиле
      if (typeof window.updateLiveStatusUI === 'function') {
        window.updateLiveStatusUI();
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
