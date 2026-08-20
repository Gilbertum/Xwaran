document.addEventListener("DOMContentLoaded", () => {
    // 1. Имитация статуса онлайна
    const isLive = false; 
    const statusBadge = document.getElementById('stream-status');
    
    if (isLive) {
        statusBadge.classList.remove('offline');
        statusBadge.classList.add('live');
        statusBadge.innerHTML = '<span class="indicator"></span> ОНЛАЙН (LIVE)';
    }

    // 2. Переключение образов Хвори
    const mainModel = document.getElementById('main-model');
    const modelButtons = document.querySelectorAll('#model-switcher .btn');

    modelButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Убираем класс active у всех кнопок
            modelButtons.forEach(btn => btn.classList.remove('active'));
            // Добавляем нажатой кнопке
            e.target.classList.add('active');
            
            // Получаем ссылку на картинку из data-src и меняем главное изображение
            const newImageSrc = e.target.getAttribute('data-src');
            
            // Простая анимация исчезновения и появления
            mainModel.style.opacity = 0;
            setTimeout(() => {
                mainModel.src = newImageSrc;
                mainModel.style.opacity = 1;
            }, 200); // 200мс на смену
        });
    });

      // 3. Логика галереи (Раскрытие картинок)
    const modal = document.getElementById("image-modal");
    const modalImg = document.getElementById("expanded-img");
    const closeModal = document.querySelector(".close-modal");
    
    // Выбираем все картинки в сетке галереи
    const galleryImages = document.querySelectorAll(".art-grid img");
    
    galleryImages.forEach(img => {
        img.addEventListener("click", function() {
            modal.style.display = "block";
            modalImg.src = this.src;
        });
    });
    
    // Закрытие по крестику
    closeModal.addEventListener("click", () => {
        modal.style.display = "none";
    });
    
    // Закрытие по клику в любом месте фона
    modal.addEventListener("click", (e) => {
        if(e.target === modal) {
            modal.style.display = "none";
        }
    });
