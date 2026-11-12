#include <Arduino.h>
#include <WiFi.h>
#include "secrets.h"
#include <Espalexa.h>
Espalexa espalexa;

// LED azul soldado na própria placa (seção 3.4 do plano).
const int BOARD_LED_PIN = 2;
const int EXTERNAL_LED_PIN = 4;
const int BUTTON_PIN = 19;
unsigned long lastBlinkAt = 0;
bool boardLedOn = false;
int lastButtonState = HIGH;
int pressCount = 0;
unsigned long lastChangeAt = 0;
bool serving = false;
unsigned long servingStartedAt = 0;
bool wifiConnected = false;

void requestDispense()
{
  if (serving)
  {
    Serial.println("Recusado: já servindo.");
  }
  else
  {
    pressCount++;
    serving = true;
    servingStartedAt = millis();
    digitalWrite(EXTERNAL_LED_PIN, HIGH);
    Serial.print("Contador de Porções: ");
    Serial.println(pressCount);
  }
}

void onAlexaChanged(uint8_t brightness)
{
  Serial.print("alexa mandou: ");
  Serial.println(brightness);
  if (brightness > 0)
  {
    requestDispense();
  }
};

void setup()
{
  Serial.begin(115200);
  pinMode(BOARD_LED_PIN, OUTPUT);
  pinMode(EXTERNAL_LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop()
{
  int buttonState = digitalRead(BUTTON_PIN);
  if (WiFi.status() == WL_CONNECTED && wifiConnected == false)
  {
    wifiConnected = !wifiConnected;
    Serial.print("Wi-FI Conectado: ");
    Serial.println(WiFi.localIP());
    espalexa.addDevice("alimentador", onAlexaChanged);
    espalexa.begin();
  }

  if (wifiConnected)
  {
    espalexa.loop();
  }

  if (buttonState == LOW && lastButtonState == HIGH && millis() - lastChangeAt > 50)
  {
    requestDispense();
  }

  if (buttonState != lastButtonState)
  {
    lastChangeAt = millis();
  }
  if (millis() - lastBlinkAt >= 500)
  {
    lastBlinkAt = millis();
    boardLedOn = !boardLedOn;
    digitalWrite(BOARD_LED_PIN, boardLedOn);
  }
  if (serving == true && millis() - servingStartedAt >= 1000)
  {
    digitalWrite(EXTERNAL_LED_PIN, LOW);
    serving = false;
    Serial.println("Porção servida");
    if (wifiConnected)
    {
      espalexa.getDevice(0)->setValue(0);
    }
  }

  lastButtonState = buttonState;
}
