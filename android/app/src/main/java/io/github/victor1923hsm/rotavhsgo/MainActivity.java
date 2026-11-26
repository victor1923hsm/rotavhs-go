package io.github.victor1923hsm.rotavhsgo;

import android.os.Build;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

import io.github.victor1923hsm.rotavhsgo.cofre.CofreChavePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Plugin local (não vem do npm): precisa ser registrado antes de a ponte iniciar.
        registerPlugin(CofreChavePlugin.class);
        super.onCreate(savedInstanceState);
        // RB-1: o app não tem login; desligar o preenchimento automático do Android evita que um gerenciador de
        // senhas ofereça guardar a chave da API digitada no campo protegido.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        }
    }
}
