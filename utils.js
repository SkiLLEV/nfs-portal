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
    customClass: { popup: 'nfs-toast-border' }
  });
}

/**
 * 2. Функция обновления счетчика сообщений
 * Ищет элемент с id="msgBadge" и ставит туда количество непрочитанных DM
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
      badge.innerText = count; // NFS Style: просто число без скобок
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * 3. ГЛОБАЛЬНЫЙ ТРЕКЕР СТАТУСА (МАЯК)
 * Отслеживает онлайн, местоположение на сайте и обновляет UI без перезагрузки базы
 */
async function initGlobalStatus(supabase, profile) {
  if (!supabase || !profile) return;

  // Определяем, на какой странице сейчас гонщик
  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  // Создаем единый канал Presence для всего сайта
  const statusChannel = supabase.channel('global-online', {
    config: { presence: { key: profile.username } }
  });

  statusChannel
    .on('presence', { event: 'sync' }, () => {
      // Обновляем локальный объект онлайна
      onlineUsers = statusChannel.presenceState();

      // --- ОБНОВЛЕНИЕ UI ---

      // 1. Счетчик в футере
      const footerOnline = document.getElementById('footerOnline');
      if (footerOnline) {
        footerOnline.innerText = Object.keys(onlineUsers).length;
      }

      // 2. Красные точки в сайдбаре (на главной)
      // Вызываем renderFriendsUI через глобальный мост window.updateFriendsStatusOnly
      if (typeof window.updateFriendsStatusOnly === 'function') {
        window.updateFriendsStatusOnly();
      }

      // 3. Точки в списке чатов (в мессенджере)
      if (typeof loadRecentDMs === 'function') {
        loadRecentDMs();
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Ставим статус ONLINE в таблице профилей
        await supabase.from('profiles').update({ status: 'ONLINE' }).eq('id', profile.id);

        // Передаем данные в радар
        await statusChannel.track({
          user: profile.username,
          location: currentPage,
          status: profile.status || 'ONLINE'
        });
      }
    });

  // Авто-оффлайн при закрытии вкладки
  window.addEventListener('beforeunload', () => {
    // Отправляем запрос без await, чтобы успел уйти
    supabase.from('profiles').update({ status: 'OFFLINE' }).eq('id', profile.id);
  });
}
