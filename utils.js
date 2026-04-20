// Глобальный объект радара
let onlineUsers = {};

/**
 * 1. Уведомления NFS
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
    customClass: { popup: 'nfs-toast-border' }
  });
}

/**
 * 2. Счетчик сообщений
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
 * 3. Пометка прочитанных
 */
async function markAllMsgsAsRead(supabase, myId) {
  if (!supabase || !myId) return;
  const { error } = await supabase
    .from('direct_messages')
    .update({ is_read: true })
    .eq('receiver_id', myId)
    .eq('is_read', false);

  if (!error) {
    const badge = document.getElementById('msgBadge');
    if (badge) badge.style.display = 'none';
  }
}

/**
 * 4. ГЛОБАЛЬНЫЙ МАЯК (initGlobalStatus)
 */
async function initGlobalStatus(supabase, profile) {
  if (!supabase) return;

  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  // Создаем канал
  const statusChannel = supabase.channel('global-online', {
    config: {
      presence: {
        key: profile ? profile.username : 'guest_' + Math.random().toString(36).substr(2, 5)
      }
    }
  });

  // --- ШАГ 1: СНАЧАЛА НАСТРАИВАЕМ ОБРАБОТЧИКИ ---
  statusChannel.on('presence', { event: 'sync' }, () => {
    onlineUsers = statusChannel.presenceState();

    const footerOnline = document.getElementById('footerOnline');
    if (footerOnline) footerOnline.innerText = Object.keys(onlineUsers).length;

    if (typeof window.updateFriendsStatusOnly === 'function') window.updateFriendsStatusOnly();
    if (typeof window.updateLiveStatusUI === 'function') window.updateLiveStatusUI();
  });

  // Глобальная функция для трекинга
  window.trackMyStatus = async (newStatus) => {
    if (!profile) return;
    await statusChannel.track({
      user: profile.username,
      location: currentPage,
      status: newStatus || profile.status || 'ONLINE'
    });
  };

  // --- ШАГ 2: ТОЛЬКО ТЕПЕРЬ ПОДПИСЫВАЕМСЯ ---
  statusChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED' && profile) {
      await window.trackMyStatus();
    }
  });

  // Обработка оффлайна
  if (profile) {
    window.addEventListener('beforeunload', () => {
      supabase.from('profiles').update({ status: 'OFFLINE' }).eq('id', profile.id);
    });
  }
}
