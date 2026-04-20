// Глобальный объект радара
let onlineUsers = {};

/**
 * 1. Функция для уведомлений в стиле NFS
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

  // Создаем канал ОДИН раз
  const statusChannel = supabase.channel('global-online', {
    config: { presence: { key: profile.username } }
  });

  // Глобальная функция для трекинга (чтобы дергать из профиля)
  window.trackMyStatus = async (newStatus) => {
    const s = newStatus || profile.status || 'ONLINE';
    await statusChannel.track({
      user: profile.username,
      location: currentPage,
      status: s
    });
  };

  statusChannel
    .on('presence', { event: 'sync' }, () => {
      onlineUsers = statusChannel.presenceState();

      // Обновляем футер
      const footerOnline = document.getElementById('footerOnline');
      if (footerOnline) {
        footerOnline.innerText = Object.keys(onlineUsers).length;
      }

      // Рассылаем сигналы на обновление UI
      if (typeof window.updateFriendsStatusOnly === 'function') window.updateFriendsStatusOnly();
      if (typeof window.loadRecentDMs === 'function') window.loadRecentDMs();
      if (typeof window.updateLiveStatusUI === 'function') window.updateLiveStatusUI();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // При входе НЕ затираем базу словом ONLINE, а просто трекаем текущий статус
        await window.trackMyStatus();
      }
    });

  // Ставим OFFLINE только при закрытии вкладки
  window.addEventListener('beforeunload', () => {
    supabase.from('profiles').update({ status: 'OFFLINE' }).eq('id', profile.id);
  });

  // Добавь это в utils.js
  async function markAllMsgsAsRead(supabase, myId) {
    if (!supabase || !myId) return;

    const { error } = await supabase
      .from('direct_messages')
      .update({ is_read: true })
      .eq('receiver_id', myId)
      .eq('is_read', false);

    if (!error) {
      // После того как пометили в базе, скрываем бейдж на странице
      const badge = document.getElementById('msgBadge');
      if (badge) badge.style.display = 'none';
    }
  }
}
