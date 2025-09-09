document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.select-all').forEach(function (selectAllCheckbox) {
        const containerId = selectAllCheckbox.getAttribute('data-target');
        const container = document.getElementById(containerId);

        if (!container) return;

        // Handle "Select All" toggle
        selectAllCheckbox.addEventListener('change', function () {
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
        });

        // Update "Select All" if any box is unchecked
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', function () {
                const allChecked = [...container.querySelectorAll('input[type="checkbox"]')]
                    .every(box => box.checked);
                selectAllCheckbox.checked = allChecked;
            });
        });
    });
});