## Passkeys: Setup and use

Passkeys is a more secure and modern way to authenticate towards a backend. Many current operating systems support it. Passkeys can also be used utilizing a hardware dongle for even more security.


``` AUTHENTICATION_BACKENDS = ['passkeys.backend.PasskeyModelBackend'] # Change your authentication backend
FIDO_SERVER_ID="your.domain.name"      # Server rp id for FIDO2, it the full domain of your project
FIDO_SERVER_NAME="EXACT"
import passkeys
KEY_ATTACHMENT = None
```

After logging in, users can register a key (enrollment) in the user profile:

<img width="1043" height="514" alt="image" src="https://github.com/user-attachments/assets/34e7d38f-33e8-4d87-808d-6209c4e0d9ba" />

Step 1: Enter a name for the key

<img width="793" height="333" alt="image" src="https://github.com/user-attachments/assets/f1573704-ee69-4c67-97fe-da7f021fa250" />

Step 2: Add key with your key provider (here: Mac OS)
<img width="493" height="298" alt="image" src="https://github.com/user-attachments/assets/87b405dc-8e04-4707-8baf-09077ec5116e" />

Step 3: Hit close, after a page refresh the key should be visible:
<img width="1157" height="220" alt="image" src="https://github.com/user-attachments/assets/67e4e965-9875-4017-831a-c2d41bbc829c" />

Now the user can log in using the passkey by clicking the "Login by passkeys" button:
<img width="497" height="280" alt="image" src="https://github.com/user-attachments/assets/6f91d45f-a13b-467a-98ca-87278f8bb2d9" />

