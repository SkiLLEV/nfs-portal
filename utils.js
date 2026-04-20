// 1. Функция для уведомлений в стиле NFS
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

// 2. Функция обновления счетчика сообщений (вынесена отдельно)
async function updateGlobalMsgBadge(supabase, myId) {
  const { count, error } = await supabase
    .from('direct_messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', myId)
    .eq('is_read', false);

  const badge = document.getElementById('msgBadge');
  if (badge) {
    if (!error && count > 0) {
      // ТУТ МЫ СТАВИМ СКОБКИ:
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

  // Находим имя текущей страницы (например, chats.html)
  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  const statusChannel = supabase.channel('global-online', {
    config: { presence: { key: profile.username } }
  });

  statusChannel
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await supabase.from('profiles').update({ status: 'ONLINE' }).eq('id', profile.id);
        // Шлем в радар не просто онлайн, а конкретную страницу!
        await statusChannel.track({
          user: profile.username,
          location: currentPage,
          online: true
        });
      }
    });

  window.addEventListener('beforeunload', () => {
    supabase.from('profiles').update({ status: 'OFFLINE' }).eq('id', profile.id);
  });
}
