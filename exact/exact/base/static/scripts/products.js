(function () {
    const API_IMAGES_BASE_URL = '/images/api/imageset/';
    const ADMINISTRATION_BASE_URL = '/administration/products/';
    const FEEDBACK_DISPLAY_TIME = 3000;

    var gCsrfToken;
    var gHeaders;


    function addProduct() {
        let product_id = $('#product_id').val();

        let data = {
            product_id: product_id,
            image_set_id: gImageSetId
        };

        $('.js_feedback').stop().addClass('hidden');
        $('#add_product_btn').prop('disabled', true);
        $.ajax(API_IMAGES_BASE_URL + 'product/add/', {
            type: 'POST',
            headers: gHeaders,
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (data, textStatus, jqXHR) {
                if (jqXHR.status === 200) {
                    $("#add_product_btn").notify("Product already added.",
                            {position: "top", className: "warn"});

                } else if (jqXHR.status === 201) {
                    $("#add_product_btn").notify("Product added.",
                            {position: "top", className: "info"});

                    var el = document.getElementById('products-with-delete');
                    if (el) {
                        var inner_span = document.createElement("span");
                        inner_span.setAttribute('class', 'fa fa-remove product-delete');
                        inner_span.setAttribute('value', data.product.id);

                        var outer_span = document.createElement("span");
                        outer_span.setAttribute('class', 'label label-info');
                        outer_span.setAttribute('id', 'product_' + data.product.id);
                        //outer_span.id = "product_" + data.product.id;

                        var link = document.createElement("a");
                        link.setAttribute('value', data.product.id);
                        link.setAttribute('href', ADMINISTRATION_BASE_URL + data.product.id);
                        link.textContent = data.product.name;

                        outer_span.appendChild(link);
                        outer_span.appendChild(inner_span);
                        el.appendChild(outer_span);

                        //el.innerHTML += '&#8203;';
                    }

                    $.each($('.product-delete'), function (number, element) {
                        $(element).click(deleteProduct);
                    });
                }
                $('#add_product_btn').prop('disabled', false);
            },
            error: function () {
                $('#add_product_btn').prop('disabled', false);

                $.notify(`There was an unhandled error during the connection.`,
                                {position: "bottom center", className: "error"});
            }
        });
    }

    function deleteProduct(event) {
        let product_id = event.currentTarget.getAttribute('value');
        let data = {
            product_id: product_id,
            image_set_id: gImageSetId
        };
        let self = $(this);
        $.ajax(API_IMAGES_BASE_URL + 'product/delete/', {
            type: 'DELETE',
            headers: gHeaders,
            dataType: 'json',
            data: JSON.stringify(data),
            success: function (data, textStatus, jqXHR) {
                //self.parent().remove();

                document.getElementById("product_" + data.product.id).remove();


                $("#add_product_btn").notify("Product removed.",
                            {position: "top", className: "info"});
            },
            error: function () {
                $.notify(`There was an unhandled error during the connection.`,
                                {position: "bottom center", className: "error"});
            }
        });
    }

    $(function () {
        // get current environment
        gCsrfToken = $('[name="csrfmiddlewaretoken"]').first().val();
        gImageSetId = parseInt($('#image_set_id').html());
        gHeaders = {
            "Content-Type": 'application/json',
            "X-CSRFTOKEN": gCsrfToken
        };
        $('#add_product_btn').click(addProduct);

        $.each($('.product-delete'), function (number, element) {
            $(element).click(deleteProduct);
        });

    });
})();
