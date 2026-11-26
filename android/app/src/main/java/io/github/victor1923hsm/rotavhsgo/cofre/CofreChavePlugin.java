package io.github.victor1923hsm.rotavhsgo.cofre;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;
import java.util.Arrays;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Cofre da chave da API de rotas (RB-1, opção C aprovada em 2026-11-26).
 *
 * - Só os recursos oficiais do Android: chave AES-256 gerada DENTRO do Android Keystore (não exportável),
 *   cifra AES/GCM/NoPadding com IV aleatório gerado pelo próprio Keystore e marca de 128 bits. Nenhum algoritmo próprio.
 * - Guarda no aparelho só o texto CIFRADO (SharedPreferences privadas do app). O backup do app está desligado
 *   (AndroidManifest: allowBackup=false, fullBackupContent=false, dataExtractionRules=sem_backup).
 * - Só quatro operações: guardar, ler, existe, apagar. Nada é registrado em log; as mensagens de erro são
 *   códigos fixos, sem a chave e sem o texto da exceção.
 * - Chave invalidada pelo sistema, dados restaurados sem a chave do Keystore ou cifra adulterada: tudo é apagado
 *   e o estado volta "invalidada" (você cadastra de novo). Reinstalar o app apaga as duas partes.
 */
@CapacitorPlugin(name = "CofreChave")
public class CofreChavePlugin extends Plugin {

    private static final String ALIAS = "rotavhsgo.cofre.chave-rotas.v1";
    private static final String ARQUIVO = "rotavhsgo_cofre";
    private static final String CAMPO = "c1";
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String CIFRA = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;
    /** Associa o texto cifrado a esta finalidade (outro uso do mesmo material não decifra). */
    private static final byte[] AAD = "rotavhsgo:chave-rotas:v1".getBytes(StandardCharsets.UTF_8);
    private static final int MAX_CARACTERES = 4096;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(ARQUIVO, Context.MODE_PRIVATE);
    }

    private static KeyStore keystore() throws GeneralSecurityException, java.io.IOException {
        KeyStore ks = KeyStore.getInstance(KEYSTORE);
        ks.load(null);
        return ks;
    }

    private static SecretKey chaveExistente() throws GeneralSecurityException, java.io.IOException {
        KeyStore ks = keystore();
        if (!ks.containsAlias(ALIAS)) return null;
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    private static SecretKey novaChave(boolean strongBox) throws GeneralSecurityException {
        KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true);
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) b.setIsStrongBoxBacked(true);
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        g.init(b.build());
        return g.generateKey();
    }

    /** Gera a chave do Keystore (StrongBox quando o aparelho tem; senão o Keystore comum, também protegido). */
    private static SecretKey gerarChave() throws GeneralSecurityException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                return novaChave(true);
            } catch (java.security.ProviderException e) {
                // StrongBoxUnavailableException (aparelho sem StrongBox) ou falha do StrongBox: segue para o Keystore comum
            }
        }
        return novaChave(false);
    }

    private void apagarTudo() {
        prefs().edit().remove(CAMPO).commit();
        try {
            KeyStore ks = keystore();
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
        } catch (Exception e) {
            // sem log: nada a fazer além de seguir
        }
    }

    private static JSObject estado(String estado) {
        JSObject r = new JSObject();
        r.put("estado", estado);
        return r;
    }

    @PluginMethod
    public void guardar(PluginCall call) {
        String valor = call.getString("valor");
        if (valor == null || valor.isEmpty() || valor.length() > MAX_CARACTERES) {
            call.reject("Valor inválido.", "COFRE_VALOR_INVALIDO");
            return;
        }
        byte[] claro = valor.getBytes(StandardCharsets.UTF_8);
        try {
            // Substituir = nova chave do Keystore + nova cifra (o material antigo some junto).
            apagarTudo();
            SecretKey k = gerarChave();
            Cipher c = Cipher.getInstance(CIFRA);
            c.init(Cipher.ENCRYPT_MODE, k);
            c.updateAAD(AAD);
            byte[] cifrado = c.doFinal(claro);
            byte[] iv = c.getIV();
            String texto = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cifrado, Base64.NO_WRAP);
            if (!prefs().edit().putString(CAMPO, texto).commit()) {
                apagarTudo();
                call.reject("Não foi possível guardar.", "COFRE_FALHA");
                return;
            }
            call.resolve(estado("cadastrada"));
        } catch (Exception e) {
            apagarTudo();
            call.reject("Não foi possível guardar.", "COFRE_FALHA");
        } finally {
            Arrays.fill(claro, (byte) 0);
        }
    }

    /** Material guardado que não decifra (chave do Keystore invalidada ou ausente, cifra adulterada). */
    private static final class Invalida extends Exception {
        private static final long serialVersionUID = 1L;
    }

    /** Decifra o que está guardado; null se não há nada. Nunca registra nada. */
    private byte[] decifrar() throws Invalida, GeneralSecurityException, java.io.IOException {
        String texto = prefs().getString(CAMPO, null);
        SecretKey k;
        try {
            k = chaveExistente();
        } catch (UnrecoverableKeyException e) {
            throw new Invalida();
        }
        if (texto == null) {
            if (k != null) apagarTudo(); // chave órfã (sem texto): limpa
            return null;
        }
        if (k == null) throw new Invalida();
        int sep = texto.indexOf(':');
        if (sep <= 0) throw new Invalida();
        try {
            byte[] iv = Base64.decode(texto.substring(0, sep), Base64.NO_WRAP);
            byte[] cifrado = Base64.decode(texto.substring(sep + 1), Base64.NO_WRAP);
            Cipher c = Cipher.getInstance(CIFRA);
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(TAG_BITS, iv));
            c.updateAAD(AAD);
            return c.doFinal(cifrado);
        } catch (KeyPermanentlyInvalidatedException | AEADBadTagException | IllegalArgumentException e) {
            throw new Invalida();
        } catch (java.security.InvalidKeyException | javax.crypto.BadPaddingException | java.security.InvalidAlgorithmParameterException e) {
            throw new Invalida();
        }
    }

    @PluginMethod
    public void ler(PluginCall call) {
        try {
            byte[] claro = decifrar();
            if (claro == null) {
                JSObject r = estado("ausente");
                r.put("valor", JSObject.NULL);
                call.resolve(r);
                return;
            }
            JSObject r = estado("cadastrada");
            r.put("valor", new String(claro, StandardCharsets.UTF_8));
            Arrays.fill(claro, (byte) 0);
            call.resolve(r);
        } catch (Invalida e) {
            // Chave invalidada, restaurada sem o Keystore ou cifra adulterada: apaga e pede para cadastrar de novo.
            apagarTudo();
            JSObject r = estado("invalidada");
            r.put("valor", JSObject.NULL);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não foi possível ler.", "COFRE_FALHA");
        }
    }

    /** Verifica a existência E que o material ainda decifra (sem devolver o valor). */
    @PluginMethod
    public void existe(PluginCall call) {
        try {
            byte[] claro = decifrar();
            if (claro == null) {
                call.resolve(estado("ausente"));
                return;
            }
            Arrays.fill(claro, (byte) 0);
            call.resolve(estado("cadastrada"));
        } catch (Invalida e) {
            apagarTudo();
            call.resolve(estado("invalidada"));
        } catch (Exception e) {
            call.reject("Não foi possível verificar.", "COFRE_FALHA");
        }
    }

    @PluginMethod
    public void apagar(PluginCall call) {
        apagarTudo();
        call.resolve(estado("ausente"));
    }
}
