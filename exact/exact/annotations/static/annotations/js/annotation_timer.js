let timerInterval;
let startTime;
let elapsedTime = 0;
let running = false;

// Reset the timer when the page loads
window.addEventListener("load", () => {
    resetTimer();
});

// Reset + restart the timer when new image is selected
document.querySelectorAll('.annotate_image_link').forEach(link => {
    link.addEventListener('click', function () {
        resetTimer();
    });
});

/**
 * Toggles the timer between running and paused states.
 * Updates the timer display and button appearance accordingly.
 * @param {Event} event - The click event from the timer button.
 */
function toggleTimer(event) {
    const timerDisplay = document.getElementById("timer");
    const button = event.target;

    if (!running) {
        // Start fresh
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
        // Pause
        clearInterval(timerInterval);
        elapsedTime = Date.now() - startTime;

        button.textContent = "Resume";
        button.classList.remove("btn-outline-warning");
        button.classList.add("btn-outline-success");
        running = false;
    }
}

/**
 * Resets the timer to its initial state.
 */
function resetTimer() {
    clearInterval(timerInterval);
    elapsedTime = 0;
    running = false;

    const timerDisplay = document.getElementById("timer");
    const button = document.querySelector(".timer-button");
    if (timerDisplay) timerDisplay.textContent = "00:00:00";
    if (button) {
        button.textContent = "Pause"; // Always reset to "Pause"
        button.classList.remove("btn-outline-success");
        button.classList.add("btn-outline-warning");
    }

    // Immediately start the timer again
    toggleTimer({ target: document.querySelector(".timer-button") });
}