let timerInterval;
let startTime;
let elapsedTime = 0;
let running = false;

function toggleTimer() {
    const timerDisplay = document.getElementById("timer");
    const button = event.target;

    if (!running) {
        // Resume from previous elapsed time
        startTime = Date.now() - elapsedTime;
        timerInterval = setInterval(() => {
            elapsedTime = Date.now() - startTime;
            const hours = String(Math.floor(elapsedTime / (1000 * 60 * 60))).padStart(2, '0');
            const minutes = String(Math.floor((elapsedTime / (1000 * 60)) % 60)).padStart(2, '0');
            const seconds = String(Math.floor((elapsedTime / 1000) % 60)).padStart(2, '0');
            timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
        }, 1000);

        button.textContent = "Pause";
        button.classList.remove("btn-outline-success");
        button.classList.add("btn-outline-warning");
        running = true;
    } else {
        // Pause and store elapsed time
        clearInterval(timerInterval);
        elapsedTime = Date.now() - startTime;

        button.textContent = "Resume";
        button.classList.remove("btn-outline-warning");
        button.classList.add("btn-outline-success");
        running = false;
    }
}