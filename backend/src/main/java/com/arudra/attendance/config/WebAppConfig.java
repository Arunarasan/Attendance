package com.arudra.attendance.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Serves the built web app (bundled into classpath:/static by the Docker build) and falls back to index.html for page routes such as
 * /punch or /hr/employees, so a browser refresh on any screen works. Nothing under /api is ever answered with the page.
 */
@Configuration
public class WebAppConfig implements WebMvcConfigurer {
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                // Re-check on every load (a cheap 304 when unchanged), so a new release is never half-served from an old cached index.html.
                .setCacheControl(org.springframework.http.CacheControl.noCache())
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource file = location.createRelative(resourcePath);
                        if (file.exists() && file.isReadable()) return file;
                        if (resourcePath.startsWith("api/") || resourcePath.equals("api") || resourcePath.contains(".")) return null;
                        Resource index = new ClassPathResource("static/index.html");
                        return index.exists() ? index : null;
                    }
                });
    }
}
