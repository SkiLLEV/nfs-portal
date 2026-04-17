// Функция для уведомлений в стиле NFS
function nfsNotify(title, icon = 'success') {
  if (typeof Swal === 'undefined') {
    console.error("SweetAlert2 не подключен! Проверь <script> в head.");
    return;
  }

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
    padding: '1rem',
    customClass: {
      popup: 'nfs-toast-border'
    }
  });

  async function updateGlobalMsgBadge(supabase, myId) {
    // Считаем сообщения, где мы получатели и они еще не прочитаны
    const { count, error } = await supabase
      .from('direct_messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', myId)
      .eq('is_read', false);

    const badge = document.getElementById('msgBadge'); // Ищем наш счетчик
    if (badge) {
      if (count > 0) {
        badge.innerText = `(${count})`;
        badge.style.display = 'inline'; // Показываем, если есть сообщения
      } else {
        badge.style.display = 'none'; // Прячем, если пусто
      }
    }
  }
}
