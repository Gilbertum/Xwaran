document.addEventListener("DOMContentLoaded", () => {
    // 1. Имитация статуса онлайна
    const isLive = false; 
    const statusBadge = document.getElementById('stream-status');
    
    if (isLive && statusBadge) {
        statusBadge.classList.remove('offline');
        statusBadge.classList.add('live');
        statusBadge.innerHTML = '<span class="indicator"></span> ОНЛАЙН (LIVE)';
    }

    // 2. Переключение образов Хвори
    const mainModel = document.getElementById('main-model');
    const modelButtons = document.querySelectorAll('#model-switcher .btn');

    if (mainModel && modelButtons.length > 0) {
        modelButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                modelButtons.forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                
                const newImageSrc = e.target.getAttribute('data-src');
                
                mainModel.style.opacity = 0;
                setTimeout(() => {
                    mainModel.src = newImageSrc;
                    mainModel.style.opacity = 1;
                }, 200);
            });
        });
    }

    // 3. Логика галереи (Раскрытие картинок)
    const modal = document.getElementById("image-modal");
    const modalImg = document.getElementById("expanded-img");
    const closeModal = document.querySelector(".close-modal");
    const galleryImages = document.querySelectorAll(".art-grid img");
    
    if (modal && modalImg && closeModal) {
        galleryImages.forEach(img => {
            img.addEventListener("click", function() {
                modal.style.display = "block";
                modalImg.src = this.src;
            });
        });
        
        closeModal.addEventListener("click", () => {
            modal.style.display = "none";
        });
        
        modal.addEventListener("click", (e) => {
            if(e.target === modal) {
                modal.style.display = "none";
            }
        });
    }
});
