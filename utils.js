// Глобальный объект радара
let onlineUsers = {};

/**
 * 0. ГЛОБАЛЬНЫЙ ЗВУК УВЕДОМЛЕНИЯ
 */
function playNotificationSound() {
  const audio = new Audio('https://cdn.pixabay.com/audio/2026/03/01/audio_4182fd0ce7.mp3');
  audio.volume = 0.6;

  audio.play().catch(err => {
    console.log("Браузер ждет клика по странице для активации звука:", err);
  });
}

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

function formatLastSeen(dateString) {
  if (!dateString) return "Давно";

  const now = new Date();
  const lastSeen = new Date(dateString);
  const diffInSeconds = Math.floor((now - lastSeen) / 1000);

  if (diffInSeconds < 60) return "Только что";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} мин. назад`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} ч. назад`;

  // Если прошло больше суток, показываем дату
  return lastSeen.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
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

  // Создаем канал для Realtime присутствия
  const statusChannel = supabase.channel('global-online', {
    config: {
      presence: {
        key: profile ? profile.username : 'guest_' + Math.random().toString(36).substr(2, 5)
      }
    }
  });

  // --- ШАГ 1: ОБРАБОТЧИКИ (Синхронизация радара) ---
  statusChannel.on('presence', { event: 'sync' }, () => {
    onlineUsers = statusChannel.presenceState();

    const footerOnline = document.getElementById('footerOnline');
    if (footerOnline) footerOnline.innerText = Object.keys(onlineUsers).length;

    if (typeof window.updateFriendsStatusOnly === 'function') window.updateFriendsStatusOnly();
    if (typeof window.updateLiveStatusUI === 'function') window.updateLiveStatusUI();
  });

  // Глобальная функция для обновления статуса в радаре
  window.trackMyStatus = async (newStatus) => {
    if (!profile) return;
    await statusChannel.track({
      user: profile.username,
      location: currentPage,
      status: newStatus || profile.status || 'ONLINE'
    });
  };

  // --- ШАГ 2: ПОДПИСКА И ОБНОВЛЕНИЕ ВРЕМЕНИ ---
  statusChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED' && profile) {
      await window.trackMyStatus();

      // ОБНОВЛЯЕМ ВРЕМЯ ВХОДА (last_seen) в базе данных
      const now = new Date().toISOString();
      await supabase
        .from('profiles')
        .update({ last_seen: now })
        .eq('id', profile.id);
    }
  });

  // --- ШАГ 2.5: 🔔 ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК СООБЩЕНИЙ СО ЗВУКОМ ---
  if (profile) {
    supabase.channel('global-audio-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `receiver_id=eq.${profile.id}`
      }, (payload) => {

        playNotificationSound();

        updateGlobalMsgBadge(supabase, profile.id);
      })
      .subscribe();
  }

  // --- ШАГ 3: ОБРАБОТКА ВЫХОДА (OFFLINE) ---
  if (profile) {
    window.addEventListener('beforeunload', () => {
      const now = new Date().toISOString();
      // При закрытии вкладки ставим статус OFFLINE и фиксируем финальное время
      supabase
        .from('profiles')
        .update({
          status: 'OFFLINE',
          last_seen: now
        })
        .eq('id', profile.id);
    });
  }
}
