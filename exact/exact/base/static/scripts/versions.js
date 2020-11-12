function include_server_subdir(url) {
  sub_dir =  window.location.pathname.split("/annotations")[0]
  if (sub_dir === "") { return url } else { return sub_dir + url }
}

(function() {
  const API_IMAGES_BASE_URL = include_server_subdir('/api/v1/images/');
  const FEEDBACK_DISPLAY_TIME = 3000;

  var gCsrfToken;
  var gHeaders;
  var gHideFeedbackTimeout;

  /**
   * Display a feedback element for a few seconds.
   *
   * @param elem
   */
  function displayFeedback(elem) {
    if (gHideFeedbackTimeout !== undefined) {
      clearTimeout(gHideFeedbackTimeout);
    }

    elem.removeClass('hidden');

    gHideFeedbackTimeout = setTimeout(function() {
      $('.js_feedback').addClass('hidden');
    }, FEEDBACK_DISPLAY_TIME);
  }

  function addVersion() {
    let name = $('#new_version_name_field').val();

    if (name === '') {
      displayFeedback($('#feedback_empty_version_name'));
      return;
    }

    let data = {
      name: name,
      imagesets: [gImageSetId],
      annotationversion_set: []
    };

    $('.js_feedback').stop().addClass('hidden');
    $('#add_version_btn').prop('disabled', true);
    $.ajax(API_IMAGES_BASE_URL + 'set_versions/', {
      type: 'POST',
      headers: gHeaders,
      dataType: 'json',
      data: JSON.stringify(data),
      success: function(data, textStatus, jqXHR) {
        if (jqXHR.status === 200) {
          displayFeedback($('#feedback_version_exists'));
        } else if (jqXHR.status === 201) {
          displayFeedback($('#feedback_version_added'));
        }
        $('#new_version_name_field').val('');
        $('#add_version_btn').prop('disabled', false);
      },
      error: function() {
        $('#add_version_btn').prop('disabled', false);
        displayFeedback($('#feedback_connection_error'));
      }
    });
  }


  $(function() {
    // get current environment
    gCsrfToken = $('[name="csrfmiddlewaretoken"]').first().val();
    gImageSetId = parseInt($('#image_set_id').html());
    gHeaders = {
      "Content-Type": 'application/json',
      "X-CSRFTOKEN": gCsrfToken
    };
    $('#add_version_btn').click(addVersion);
  });
})();
