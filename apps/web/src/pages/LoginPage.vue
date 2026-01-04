<script setup lang="ts">
    import { ref } from "vue";
    import { http } from "../services/http";
    import { useRouter } from "vue-router";
    
    const router = useRouter();
    const email = ref("test@test.com");
    const password = ref("test123");
    const msg = ref("");
    
    async function login() {
      try {
        const res = await http.post("/auth/login", { email: email.value, password: password.value });
        localStorage.setItem("token", res.data.token);
        router.push("/dashboard");
      } catch {
        msg.value = "Login failed";
      }
    }
    </script>
    
    <template>
      <div style="max-width:420px;margin:40px auto;">
        <h2>Login</h2>
        <input v-model="email" placeholder="email" style="width:100%;margin:6px 0;" />
        <input v-model="password" type="password" placeholder="password" style="width:100%;margin:6px 0;" />
        <button @click="login">Se connecter</button>
        <p>{{ msg }}</p>
      </div>
    </template>
    