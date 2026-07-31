"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router=useRouter();const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setLoading(true);setError("");const data=Object.fromEntries(new FormData(e.currentTarget));const res=await fetch(`/api/auth/${mode}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});const json=await res.json();setLoading(false);if(!res.ok){setError(json.error??"Не удалось выполнить запрос");return}router.push("/account");router.refresh()}
  return <form className="auth-form" onSubmit={submit}><label>Электронная почта<input required type="email" name="email" autoComplete="email" placeholder="you@example.ru"/></label>{mode==="register"&&<label>Как вас зовут<input required name="name" autoComplete="name" minLength={2}/></label>}<label>Пароль<input required type="password" name="password" minLength={8} autoComplete={mode==="login"?"current-password":"new-password"}/></label>{error&&<p className="form-error">{error}</p>}<button className="button button-primary" disabled={loading}>{loading?"Подождите…":mode==="login"?"Войти":"Создать аккаунт"}</button><small>Демо: demo@postupai.ru · Demo2026!</small></form>
}
