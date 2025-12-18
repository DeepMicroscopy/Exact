from django.shortcuts import render
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.contrib.auth import authenticate,login,logout
from django.contrib.auth.models import User
from django.contrib.auth.forms import AuthenticationForm


# views.py
from django.contrib.auth import authenticate, login
from django.shortcuts import render, redirect
from django.urls import reverse
from django import forms

class LoginForm(forms.Form):
    username = forms.CharField()
    password = forms.CharField(widget=forms.PasswordInput)

def loginView(request):
    if len(request.POST.get('passkeys',''))==0:
        form = LoginForm(request.POST or None)
        invalid = False
    else:
        form = LoginForm(None)

    if len(request.POST.get('passkeys',''))>0:
        user=authenticate(request, username=request.POST["username"],password=request.POST["password"])
        if user:
            login(request, user)
            return redirect(request.POST.get("next") or reverse("images:index"))
        form.add_error(None, "Invalid username or password.")

    if request.method == "POST" and form.is_valid():
        user = authenticate(
            request,
            username=form.cleaned_data["username"],
            password=form.cleaned_data["password"],
        )
        if user is not None:
            login(request, user)
            return redirect(request.POST.get("next") or reverse("images:index"))
        invalid = True
        form.add_error(None, "Invalid username or password.")

    return render(request, "registration/login.html", {"form": form, "invalid": invalid})



def logoutView(request):
    logout(request)
    return  render(request,"registration/logged_out.html",{})
