// main.js

// Имитация проверки статуса стрима
const isLive = false; // Поменяйте на true, чтобы увидеть статус "ОНЛАЙН"

document.addEventListener("DOMContentLoaded", () => {
    const statusBadge = document.getElementById('stream-status');
    
    if (isLive) {
        statusBadge.classList.remove('offline');
        statusBadge.classList.add('live');
        statusBadge.innerHTML = '<span class="indicator"></span> ОНЛАЙН (LIVE)';
    }

    // Логика переключения образов витубера
    const themeButtons = document.querySelectorAll('.theme-switcher .btn');
    themeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Убираем активный класс у всех кнопок
            themeButtons.forEach(btn => btn.style.backgroundColor = 'transparent');
            // Добавляем активный класс нажатой
            e.target.style.backgroundColor = 'var(--accent-color)';
            
            // Здесь в будущем будем менять картинку модели (src у .model-img)
            console.log(`Выбран образ: ${e.target.innerText}`);
        });
    });
});
